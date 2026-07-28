(() => {
  "use strict";

  const STORAGE_KEY = "city-pop-theme";
  const THEMES = new Set(["light", "dark"]);
  const root = document.documentElement;

  let activeDictionary = null;
  let boundControl = null;

  root.classList.add("js");

  function normaliseTheme(value) {
    if (value === "dark" || value === "night") return "dark";
    if (value === "light" || value === "day") return "light";
    return null;
  }

  function readStoredTheme() {
    try {
      return normaliseTheme(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The preference still works for the current page.
    }
  }

  function systemTheme() {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function currentTheme() {
    return THEMES.has(root.dataset.theme) ? root.dataset.theme : "light";
  }

  function defaultLabels(language) {
    const english = language === "en";

    return english
      ? {
          themeToDark: "Enable dark mode",
          themeToLight: "Enable light mode",
          themeDarkLabel: "DARK",
          themeLightLabel: "LIGHT",
        }
      : {
          themeToDark: "Ativar modo noturno",
          themeToLight: "Ativar modo diurno",
          themeDarkLabel: "NOITE",
          themeLightLabel: "DIA",
        };
  }

  function updateControl() {
    const control = document.querySelector("[data-theme-control]");
    const label = document.querySelector("[data-theme-label]");
    const themeMeta = document.querySelector("#theme-color");
    const language = root.lang === "en" ? "en" : "pt-BR";
    const dictionary = activeDictionary ?? defaultLabels(language);
    const isDark = currentTheme() === "dark";

    if (control) {
      control.setAttribute("aria-pressed", String(isDark));
      control.setAttribute(
        "aria-label",
        isDark ? dictionary.themeToLight : dictionary.themeToDark,
      );
    }

    if (label) {
      label.textContent = isDark
        ? dictionary.themeLightLabel
        : dictionary.themeDarkLabel;
    }

    if (themeMeta) {
      themeMeta.content = isDark ? "#050505" : "#f7f4ec";
    }
  }

  function setTheme(theme, { persist = true, notify = true } = {}) {
    const selectedTheme = normaliseTheme(theme) ?? "light";
    root.dataset.theme = selectedTheme;

    if (persist) storeTheme(selectedTheme);
    updateControl();

    if (notify) {
      window.dispatchEvent(
        new CustomEvent("citypop:themechange", {
          detail: { theme: selectedTheme },
        }),
      );
    }
  }

  function toggleTheme() {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  function bindControl() {
    const control = document.querySelector("[data-theme-control]");
    if (!control || control === boundControl) {
      updateControl();
      return;
    }

    control.addEventListener("click", toggleTheme);
    boundControl = control;
    updateControl();
  }

  function refreshLabels(dictionary) {
    activeDictionary = dictionary ?? null;
    updateControl();
  }

  const initialTheme = readStoredTheme() ?? systemTheme();
  setTheme(initialTheme, { persist: false, notify: false });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindControl, { once: true });
  } else {
    bindControl();
  }

  window.CityPopTheme = Object.freeze({
    get: currentTheme,
    set: setTheme,
    toggle: toggleTheme,
    refreshLabels,
  });
})();
