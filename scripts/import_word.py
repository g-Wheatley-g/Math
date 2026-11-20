"""Convert the structured mathematics study guide to static site content."""

import argparse
from copy import deepcopy
import json
from pathlib import Path
import re
import subprocess
from zipfile import ZipFile

from lxml import html


COURSES = {
    "analysis": {
        "title": "Математический анализ",
        "short": "МА",
        "description": "Функции, пределы, производные и интегралы.",
        "groups": [
            (1, 12, "Функции, пределы и непрерывность"),
            (13, 22, "Производные и дифференциалы"),
            (23, 33, "Теоремы о производной и исследование графиков"),
            (34, 44, "Первообразные и методы интегрирования"),
            (45, 52, "Определённые и несобственные интегралы"),
            (53, 56, "Площадь, объём, длина дуги и поверхность"),
        ],
    },
    "algebra": {
        "title": "Линейная алгебра",
        "short": "ЛА",
        "description": "Матрицы, векторы и аналитическая геометрия.",
        "groups": [
            (1, 7, "Матрицы, определители и системы уравнений"),
            (8, 12, "Векторы и их произведения"),
            (13, 18, "Прямые, плоскости, кривые и поверхности"),
            (19, 21, "Преобразования и системы координат"),
            (22, 24, "Пространства, операторы и квадратичные формы"),
            (25, 25, "Дополнительная тема"),
        ],
    },
}

SECTIONS = {
    "Теория": "theory",
    "Примеры с решением": "examples",
    "Пример с решением": "examples",
    "Пример по шагам": "examples",
    "Практика": "practice",
    "Ответы и решения": "solutions",
}

# Explanations embedded in examples in Word also belong in their topic's theory.
# Each pair selects exact source sentences, inclusive of both endpoints.
THEORY_EXCERPTS = {
    ("analysis", "21"): [("Если", "возникает ещё одно слагаемое:")],
    ("analysis", "45"): [("Интеграл линеен", "при одинаковых пределах")],
    ("algebra", "8"): [("Числовая проекция", "равна")],
    ("algebra", "16"): [("Гипербола", "Модуль разности"), ("Парабола", "состоит из точек")],
    ("algebra", "21"): [("В сферических координатах", "Обратно")],
    ("algebra", "22"): [("Линейный оператор", "В выбранном базисе")],
}

WORKED_CHOICES = {("analysis", "21")}


def pandoc(*args, data=None):
    result = subprocess.run(["pandoc", *args], input=data, text=True, encoding="utf-8",
                            capture_output=True, check=True)
    if result.stderr.strip():
        raise ValueError(result.stderr)
    return result.stdout


def text(inlines):
    parts = []
    for item in inlines:
        kind = item["t"]
        if kind == "Str":
            parts.append(item["c"])
        elif kind in ("Space", "SoftBreak", "LineBreak"):
            parts.append(" ")
        elif kind in ("Strong", "Emph"):
            parts.append(text(item["c"]))
        elif kind == "Math":
            parts.append(item["c"][1])
    return "".join(parts).strip()


def unwrap(block):
    if block["t"] == "Div":
        attrs, children = block["c"]
        return dict(attrs[2]).get("custom-style"), children
    return None, [block]


def para(parts):
    return {"t": "Para", "c": parts}


def tidy(parts):
    parts = list(parts)
    while parts and parts[0]["t"] in ("Space", "SoftBreak", "LineBreak"):
        parts.pop(0)
    while parts and parts[-1]["t"] in ("Space", "SoftBreak", "LineBreak"):
        parts.pop()
    return parts


def without_label(block, label):
    inlines = block["c"]
    if inlines[0]["t"] != "Strong" or text(inlines[0]["c"]) != label:
        raise ValueError(f"Expected {label!r}, got {text(inlines)!r}")
    return tidy(inlines[1:])


def sentence_end(item):
    if item["t"] != "Str":
        return False
    word = item["c"]
    return word.endswith((".", "!", "?")) and word not in {
        "см.", "рис.", "с.", "т.", "д.", "е.", "г.", "стр.", "и.", "н.", "п.",
    }


def split_sentences(inlines):
    sentences = []
    start = 0
    for i, item in enumerate(inlines):
        if sentence_end(item) and i + 1 < len(inlines) and inlines[i + 1]["t"] == "Space":
            sentences.append(tidy(inlines[start:i + 1]))
            start = i + 1
    tail = tidy(inlines[start:])
    if tail:
        sentences.append(tail)
    return sentences


def theory_blocks(topic):
    blocks = list(topic["theory"])
    for start, end in THEORY_EXCERPTS.get((topic["course"], topic["id"]), []):
        for block in topic["examples"]:
            if block["t"] != "Para":
                continue
            lines = split_sentences(block["c"])
            first = next((i for i, line in enumerate(lines) if text(line).startswith(start)), None)
            if first is not None:
                last = next(i for i in range(first, len(lines)) if end in text(lines[i]))
                excerpt = []
                for line in lines[first:last + 1]:
                    excerpt.extend(line + [{"t": "Space"}])
                blocks.append(para(tidy(excerpt)))
                break
        else:
            raise ValueError(f"Could not find theory excerpt in {topic['title']}: {start!r}.")
    return blocks


def answer_parts(inlines):
    boundary = next((i for i, item in enumerate(inlines) if sentence_end(item)), None)
    if boundary is None or not tidy(inlines[boundary + 1:]):
        raise ValueError(f"Could not separate the answer from its explanation: {text(inlines)}")
    head = deepcopy(inlines[:boundary + 1])
    head[-1]["c"] = head[-1]["c"].rstrip(".")
    return [item for item in head if item.get("c") != ""], tidy(inlines[boundary + 1:])


def example_blocks(block):
    if block["t"] != "Para" or any(i["t"] == "Image" for i in block["c"]):
        return [block]
    chunks = split_sentences(block["c"])
    if len(chunks) < 2:
        return [block]
    return [{"t": "OrderedList", "c": [[1, {"t": "Decimal"}, {"t": "Period"}],
            [[{"t": "Plain", "c": chunk}] for chunk in chunks]]}]


def parse(document):
    topics = []
    notes = []
    topic = None
    section = None
    for block in document["blocks"]:
        if block["t"] == "Header" and block["c"][0] == 1:
            topic = None
            section = None
            continue
        if block["t"] == "Header" and block["c"][0] == 2:
            heading = text(block["c"][2])
            match = re.fullmatch(r"(МА|ЛА) (\d+) · (.+)", heading)
            if match:
                abbr, number, title = match.groups()
                course = "analysis" if abbr == "МА" else "algebra"
            elif heading.startswith("Дополнение к ЛА · "):
                course, number, title = "algebra", "25", heading.split(" · ", 1)[1]
            else:
                topic = None
                notes.append({"heading": heading, "blocks": []})
                continue
            topic = {"id": number, "title": title, "course": course,
                     "theory": [], "examples": [], "practice": [], "solutions": [], "source": []}
            topics.append(topic)
            section = None
            continue
        style, children = unwrap(block)
        if topic is None:
            if notes:
                if style == "Learn Label":
                    notes[-1]["blocks"].append({"t": "Header", "c": [3, ["", [], []], children[0]["c"]]})
                else:
                    notes[-1]["blocks"].extend(children)
            continue
        if style == "Learn Label":
            section = SECTIONS[text(children[0]["c"])]
        elif style == "Source Note":
            topic["source"].extend(children)
        elif section == "practice" and style == "Answer Option":
            topic[section].append(("option", children[0]))
        elif section:
            if section == "practice":
                topic[section].extend(("prompt", child) for child in children)
            else:
                topic[section].extend(children)
        else:
            raise ValueError(f"Unclassified material in topic {topic['title']}.")
    return topics, notes


def normalize_markup(node, media):
    """Only Pandoc-managed markup may be rendered; local image paths are checked."""
    if isinstance(node, list):
        for item in node:
            normalize_markup(item, media)
    elif isinstance(node, dict):
        kind = node.get("t")
        if kind in ("RawBlock", "RawInline"):
            raise ValueError("Raw HTML in the source material.")
        if kind == "Image":
            file = node["c"][2][0]
            if not re.fullmatch(r"media/rId\d+\.png", file):
                raise ValueError(f"Unsupported image path {file}.")
            media.add(file)
            node["c"][0] = ["", [], []]
            if not node["c"][1]:
                node["c"][1] = [{"t": "Str", "c": "Иллюстрация из учебного материала"}]
        if kind == "Link":
            node["t"] = "Span"
            node["c"] = [["", [], []], node["c"][1]]
        for value in node.values():
            normalize_markup(value, media)


def generate(document, topics, notes):
    fragments = []

    def use(blocks):
        identifier = f"content-{len(fragments)}"
        fragments.append({"t": "Div", "c": [[identifier, ["guide-fragment"], []], deepcopy(blocks)]})
        return identifier

    output = {"courses": {key: {**course, "topics": []} for key, course in COURSES.items()},
              "notes": [{"title": n["heading"], "html": use(n["blocks"])} for n in notes]}
    for topic in topics:
        for key in ("theory", "examples", "practice", "solutions", "source"):
            if not topic[key]:
                raise ValueError(f"Missing section {key} in {topic['title']}.")
        prompt, *options, entry_prompt = topic["practice"]
        if prompt[0] != "prompt" or entry_prompt[0] != "prompt" or len(options) != 3:
            raise ValueError(f"Unexpected exercise layout in {topic['title']}.")
        choice_line, entry_line = topic["solutions"]
        choice = without_label(choice_line, "Выбор.")
        letter = choice[0]["c"].rstrip(".")
        answers = []
        for kind, block in options:
            if kind != "option" or not re.fullmatch(r"[АБВ]\)", block["c"][0]["c"]):
                raise ValueError(f"Invalid answer option in {topic['title']}.")
            answers.append({"id": block["c"][0]["c"][0], "html": use([para(tidy(block["c"][1:]))])})
        if len({answer["id"] for answer in answers}) != 3 or letter not in {a["id"] for a in answers}:
            raise ValueError(f"Missing correct choice in {topic['title']}.")
        answer, steps = answer_parts(without_label(entry_line, "Ввод."))
        examples = []
        for block in topic["examples"]:
            if block["t"] == "Para" and any(i["t"] == "Image" for i in block["c"]) and examples:
                examples[-1].append(block)
            else:
                examples.append(example_blocks(block))
        if (topic["course"], topic["id"]) in WORKED_CHOICES:
            correct_option = next(block for _, block in options if block["c"][0]["c"] == letter + ")")
            explanation = tidy(choice[1:])
            correct_answer = tidy(correct_option["c"][1:])
            examples.append([
                para(without_label(prompt[1], "1. Выберите ответ.")),
                *example_blocks(para(explanation)),
                para([{"t": "Strong", "c": [{"t": "Str", "c": "Ответ."}]}, {"t": "Space"}, *correct_answer]),
            ])
        output["courses"][topic["course"]]["topics"].append({
            "id": topic["id"], "title": topic["title"], "theory": use(theory_blocks(topic)),
            "examples": [use(blocks) for blocks in examples],
            "tableExamples": [use([block]) for block in topic["theory"] if block["t"] == "Table"],
            "choice": {"prompt": use([para(without_label(prompt[1], "1. Выберите ответ."))]),
                       "options": answers, "correct": letter, "solution": use([para(tidy(choice[1:]))])},
            "entry": {"prompt": use([para(without_label(entry_prompt[1], "2. Самостоятельный ввод."))]),
                      "answer": use([para(answer)]), "solution": use([para(steps)])},
            "source": use(topic["source"]),
        })

    media = set()
    normalize_markup(fragments, media)
    payload = {"pandoc-api-version": document["pandoc-api-version"], "meta": {}, "blocks": fragments}
    parsed = html.fragment_fromstring(pandoc("-f", "json", "-t", "html5", "--mathml",
                                             data=json.dumps(payload, ensure_ascii=False)), create_parent=True)
    rendered = {}
    for div in parsed:
        if not div.get("id", "").startswith("content-"):
            raise ValueError(f"Unexpected top-level conversion output: {div.tag} {dict(div.attrib)}.")
        for node in div.iter():
            if node.tag in ("script", "iframe", "object", "embed") or any(attr.startswith("on") for attr in node.attrib):
                raise ValueError("Executable markup in the converted document.")
        rendered[div.get("id")] = "".join(html.tostring(c, encoding="unicode") for c in div).strip()
    if len(rendered) != len(fragments) or not all(rendered.values()):
        raise ValueError("Some learning material was lost during the conversion.")

    def replace(value):
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        if isinstance(value, list):
            return [replace(item) for item in value]
        return rendered.get(value, value) if isinstance(value, str) else value

    return replace(output), media


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docx", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    args = parser.parse_args()
    document = json.loads(pandoc("-f", "docx+styles", "-t", "json", str(args.docx.resolve())))
    topics, notes = parse(document)
    for course, count in (("analysis", 56), ("algebra", 25)):
        if [int(t["id"]) for t in topics if t["course"] == course] != list(range(1, count + 1)):
            raise ValueError(f"Unexpected topic sequence in {course}.")
    output, media = generate(document, topics, notes)
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.docx) as source:
        for file in sorted(media):
            target = args.output / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read("word/" + file))
    script = "const MATH_GUIDE = " + json.dumps(output, ensure_ascii=False, indent=2) + ";\n"
    (args.output / "guide.js").write_text(script, encoding="utf-8")
    print(f"{len(topics)} topics, {2 * len(topics)} exercises, {len(media)} illustrations, "
          f"{script.count('<math ')} MathML fragments.")


if __name__ == "__main__":
    main()
