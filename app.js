"use strict";

const { courses, notes } = MATH_GUIDE;
const sections = [
  { key: "theory", title: "Теория" },
  { key: "practice", title: "Практика" },
  { key: "examples", title: "Примеры" },
];
const gaps = {
  "analysis/39": "Для кратного неприводимого квадратичного множителя дано правило. Пример разбора такого случая отсутствует.",
  "analysis/45": "Дано условие интегрируемости для ограниченной функции с разрывами первого рода. Разобранного примера с такими разрывами в теме нет.",
  "analysis/52": "Признак сравнения у конечной особой точки упомянут в теории. Примеры в этой теме разбирают только бесконечный промежуток.",
  "analysis/55": "Указано, как учитывать повторный проход и как складывать длины частей. Отдельных расчётов для этих случаев нет.",
  "algebra/16": "Для эллипса дано условие перехода в окружность. Отдельный расчёт для равных полуосей отсутствует.",
  "algebra/23": "Описан смысл отрицательного и нулевого собственных чисел. В разобранных примерах таких собственных чисел нет.",
};
const main = document.querySelector("main");
const headerSource = document.querySelector(".source-link");

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function link(href, label, className) {
  const anchor = element("a", className, label);
  anchor.href = href;
  return anchor;
}

function content(markup, className = "learn-content") {
  const node = element("div", className);
  node.innerHTML = markup;
  for (const table of node.querySelectorAll("table")) {
    const scrollbox = element("div", "table-scroll");
    scrollbox.tabIndex = 0;
    scrollbox.setAttribute("role", "region");
    scrollbox.setAttribute("aria-label", "Таблица формул");
    table.replaceWith(scrollbox);
    scrollbox.append(table);
  }
  return node;
}

function courseHash(key, section = "theory", topic) {
  return "#" + [key, section, topic?.id].filter(Boolean).join("/");
}

function topicRef(course, topic) {
  if (course.short === "ЛА" && topic.id === "25") return "Дополнение";
  return course.short + " " + topic.id;
}

function heading(title, className) {
  const h1 = element("h1", className, title);
  h1.tabIndex = -1;
  return h1;
}

function home() {
  const intro = element("section", "home-intro");
  intro.append(
    heading("Подготовка к экзамену по математике"),
    element("p", "intro-text", "Выберите дисциплину. В каждой теме есть теория, разобранные примеры и задания для самопроверки."),
  );
  const ornament = element("div", "hero-math");
  ornament.setAttribute("aria-hidden", "true");
  ornament.innerHTML = "<span>∫</span><span>f(x)</span><span>√</span>";
  intro.append(ornament);

  const cards = element("div", "course-grid");
  for (const [key, course] of Object.entries(courses)) {
    const card = link(courseHash(key), "", "course-card " + key);
    const symbol = element("span", "course-symbol", key === "analysis" ? "∫" : "⟦ ⟧");
    symbol.setAttribute("aria-hidden", "true");
    const arrow = element("span", "card-arrow", "›");
    arrow.setAttribute("aria-hidden", "true");
    const details = key === "analysis" ? "56 тем" : "24 темы и дополнение";
    card.append(symbol, arrow, element("h2", "", course.title),
      element("p", "", course.description), element("span", "card-detail", details));
    cards.append(card);
  }
  main.append(intro, cards);
}

function breadcrumbs(course, key, section, topic) {
  const nav = element("nav", "breadcrumbs");
  nav.setAttribute("aria-label", "Путь к странице");
  nav.append(link("#", "Главная"));
  if (topic) {
    nav.append(link(courseHash(key, section.key), course.title));
    const current = element("span", "", section.title);
    current.setAttribute("aria-current", "location");
    nav.append(current);
  } else {
    const current = element("span", "", course.title);
    current.setAttribute("aria-current", "page");
    nav.append(current);
  }
  return nav;
}

function tabs(key, current, topic) {
  const nav = element("nav", "section-tabs");
  nav.setAttribute("aria-label", "Разделы дисциплины");
  for (const section of sections) {
    const tab = link(courseHash(key, section.key, topic), section.title);
    if (section === current) tab.setAttribute("aria-current", "page");
    nav.append(tab);
  }
  return nav;
}

function topicList(course, key, section) {
  const list = element("section", "topic-list");
  const title = element("h2", "", "Темы");
  title.id = "topics-title";
  list.setAttribute("aria-labelledby", title.id);
  const controls = element("div", "topic-controls");
  const label = element("label", "visually-hidden", "Поиск по темам");
  label.htmlFor = "topic-search";
  const search = element("input", "topic-search");
  search.type = "search";
  search.id = label.htmlFor;
  search.placeholder = "Поиск по темам";
  controls.append(label, search);
  const groups = element("div", "topic-groups");
  const items = [];
  for (const [first, last, groupName] of course.groups) {
    const group = element("section", "topic-group");
    group.append(element("h3", "", groupName));
    const rows = element("ul", "topic-rows");
    for (const topic of course.topics.slice(first - 1, last)) {
      const row = element("li");
      const ref = topicRef(course, topic);
      const anchor = link(courseHash(key, section.key, topic), "", "topic-row");
      const arrow = element("span", "row-arrow", "›");
      arrow.setAttribute("aria-hidden", "true");
      anchor.append(element("span", "topic-ref", ref), element("span", "", topic.title), arrow);
      row.append(anchor);
      rows.append(row);
      items.push({ row, group, searchable: normalize(ref + " " + topic.title) });
    }
    group.append(rows);
    groups.append(group);
  }
  const empty = element("p", "empty-state", "По этому запросу темы не найдены.");
  empty.setAttribute("role", "status");
  empty.hidden = true;
  search.addEventListener("input", () => {
    const terms = normalize(search.value).trim().split(/\s+/);
    const visibleGroups = new Set();
    for (const item of items) {
      const visible = terms.every(term => item.searchable.includes(term));
      item.row.hidden = !visible;
      if (visible) visibleGroups.add(item.group);
    }
    for (const group of groups.children) group.hidden = !visibleGroups.has(group);
    empty.hidden = visibleGroups.size > 0;
  });
  list.append(title, controls, groups, empty);
  return list;
}

function normalize(value) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function solution(markup, correct) {
  const details = element("details", "solution");
  details.append(element("summary", "", "Показать подробное решение"));
  if (correct) details.append(element("p", "solution-key", "Верный вариант " + correct));
  details.append(content(markup));
  return details;
}

function choiceExercise(choice) {
  const card = element("section", "exercise");
  const fieldset = element("fieldset");
  const feedback = element("p", "feedback");
  feedback.setAttribute("role", "status");
  fieldset.append(element("legend", "", "Выберите ответ"), content(choice.prompt));
  const options = element("div", "options");
  for (const option of choice.options) {
    const label = element("label", "option");
    const radio = element("input");
    radio.type = "radio";
    radio.name = "choice";
    radio.value = option.id;
    const letter = element("span", "option-letter", option.id);
    const optionText = element("span", "option-text");
    optionText.append(...content(option.html).firstElementChild.childNodes);
    label.append(radio, letter, optionText);
    radio.addEventListener("change", () => {
      const isCorrect = radio.value === choice.correct;
      feedback.textContent = isCorrect ? "Верно." : "Неверно. Попробуйте ещё раз.";
      feedback.dataset.result = isCorrect ? "correct" : "incorrect";
      for (const item of options.children) item.removeAttribute("data-result");
      label.dataset.result = feedback.dataset.result;
    });
    options.append(label);
  }
  fieldset.append(options, feedback);
  card.append(fieldset, solution(choice.solution, choice.correct));
  return card;
}

function entryExercise(entry) {
  const card = element("section", "exercise");
  const form = element("form", "entry-form");
  const label = element("label", "", "Ваш ответ");
  label.htmlFor = "entry-answer";
  const input = element("input");
  input.type = "text";
  input.id = label.htmlFor;
  input.required = true;
  input.autocomplete = "off";
  const submit = element("button", "primary-button", "Показать ответ");
  submit.type = "submit";
  const controls = element("div", "entry-controls");
  controls.append(input, submit);
  form.append(label, controls);

  const comparison = element("dl", "comparison");
  comparison.setAttribute("aria-live", "polite");
  comparison.hidden = true;
  const entered = element("dd", "entered-value");
  const result = element("div");
  const expected = element("div");
  const correct = element("dd");
  correct.append(content(entry.answer));
  result.append(element("dt", "", "Ваш ответ"), entered);
  expected.append(element("dt", "", "Правильный ответ"), correct);
  comparison.append(result, expected);
  input.addEventListener("input", () => {
    input.setCustomValidity("");
    comparison.hidden = true;
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!input.value.trim()) {
      input.setCustomValidity("Введите ответ.");
      input.reportValidity();
      return;
    }
    entered.textContent = input.value.trim();
    comparison.hidden = false;
  });
  card.append(element("h2", "", "Самостоятельный ввод"), content(entry.prompt),
    form, comparison, solution(entry.solution));
  return card;
}

function study(course, key, section, topic) {
  const view = element("section", "study");
  const titleLine = element("div", "study-heading");
  titleLine.append(element("span", "topic-ref", topicRef(course, topic)),
    heading(topic.title, "topic-title"));
  view.append(titleLine);
  const area = element("div", "study-body");
  if (section.key === "theory") {
    area.append(content(topic.theory, "learn-content material-card"));
  } else if (section.key === "examples") {
    for (const [i, markup] of topic.examples.entries()) {
      const example = element("article", "material-card");
      example.append(element("h2", "", "Пример " + (i + 1)), content(markup));
      area.append(example);
    }
    for (const table of topic.tableExamples) {
      const example = element("article", "material-card");
      example.append(element("h2", "", "Примеры из таблицы формул"), content(table));
      area.append(example);
    }
  } else {
    area.append(choiceExercise(topic.choice), entryExercise(topic.entry));
  }

  const related = element("nav", "related");
  related.setAttribute("aria-label", "Связанные разделы темы");
  for (const target of sections.filter(other => other !== section)) {
    related.append(link(courseHash(key, target.key, topic), target.title, "secondary-button"));
  }
  const gap = gaps[key + "/" + topic.id];
  if (gap) {
    const notice = element("aside", "note");
    notice.append(element("p", "", gap), link("#sources", "Другие замечания к материалам"));
    area.append(notice);
  }
  const reference = element("details", "source-details");
  reference.append(element("summary", "", "Источник темы"), content(topic.source));
  view.append(area, related, reference);
  return view;
}

function showCourse(key, course, section, topic) {
  main.classList.add(key);
  main.append(breadcrumbs(course, key, section, topic));
  if (!topic) main.append(heading(course.title));
  main.append(tabs(key, section, topic));
  main.append(topic ? study(course, key, section, topic) : topicList(course, key, section));
}

function showSources() {
  main.append(link("#", "← Главная", "source-back"), heading("Источники и пробелы"));
  const sources = element("div", "sources");
  const coverage = element("section", "material-card");
  coverage.append(element("h2", "", "Каких примеров не хватает"),
    element("p", "", "В каждой теме Word есть теория, как минимум один пример и два задания. Для некоторых условий применения в документе отсутствует отдельный разбор."));
  const list = element("ul", "coverage-list");
  for (const [path, label] of Object.entries(gaps)) {
    const [key, id] = path.split("/");
    const course = courses[key];
    const topic = course.topics.find(item => item.id === id);
    const item = element("li");
    item.append(link(courseHash(key, "examples", topic), topicRef(course, topic) + " · " + topic.title),
      element("p", "", label));
    list.append(item);
  }
  coverage.append(list);
  sources.append(coverage);
  for (const note of notes) {
    const section = element("section", "material-card");
    section.append(element("h2", "", note.title), content(note.html));
    sources.append(section);
  }
  main.append(sources);
}

function render(focus = false) {
  const path = location.hash.slice(1);
  const [key, sectionKey, id, extra] = path.split("/");
  const course = Object.hasOwn(courses, key) ? courses[key] : null;
  const section = sections.find(({ key }) => key === sectionKey) || sections[0];
  const topic = course?.topics.find(item => item.id === id);
  main.className = "shell";
  main.replaceChildren();
  headerSource.removeAttribute("aria-current");
  if (!path || path === "main-content") {
    home();
  } else if (path === "sources") {
    showSources();
    headerSource.setAttribute("aria-current", "page");
  } else if (course && !extra && (!id || topic) && (!sectionKey || section.key === sectionKey)) {
    showCourse(key, course, section, topic);
  } else {
    main.append(heading("Страница не найдена"),
      link("#", "Вернуться на главную", "secondary-button"));
  }
  document.title = main.querySelector("h1").textContent + " · Математика";
  if (focus) {
    window.scrollTo(0, 0);
    main.querySelector("h1").focus({ preventScroll: true });
  }
}

document.querySelector(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  main.focus();
});
window.addEventListener("hashchange", () => render(true));
render();
