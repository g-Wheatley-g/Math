"use strict";

{
  const themes = new Set(["light", "red", "blue", "green", "plum", "amber"]);
  const storageKey = "math-study-theme";
  const root = document.documentElement;

  try {
    const saved = localStorage.getItem(storageKey);
    if (themes.has(saved)) root.dataset.theme = saved;
  } catch {
    // The page can still switch themes when browser storage is blocked.
  }

  document.addEventListener("DOMContentLoaded", () => {
    const picker = document.querySelector("#theme");
    picker.value = root.dataset.theme || "light";
    picker.addEventListener("change", () => {
      const selected = picker.value;
      if (!themes.has(selected)) return;
      root.dataset.theme = selected;
      try {
        localStorage.setItem(storageKey, selected);
      } catch {
        // Keep the theme for this page when it cannot be saved.
      }
    });
    picker.parentElement.hidden = false;
  }, { once: true });
}
