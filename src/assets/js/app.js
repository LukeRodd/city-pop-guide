import { translations } from "./i18n.js";

const STORAGE = Object.freeze({
  language: "city-pop-language",
});

const SUPPORTED_LANGUAGES = new Set(["pt-BR", "en"]);
const root = document.documentElement;
const languageControls = document.querySelectorAll("[data-language]");
const navLinks = document.querySelectorAll('.primary-nav a[href^="#"]');

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences remain valid for the current page when storage is blocked.
  }
}

function currentLanguage() {
  return SUPPORTED_LANGUAGES.has(root.lang) ? root.lang : "pt-BR";
}


function setTranslatedAttribute(selector, attribute, keyAttribute, dictionary) {
  document.querySelectorAll(selector).forEach((element) => {
    const key = element.dataset[keyAttribute];
    const value = dictionary[key];

    if (typeof value === "string") {
      element.setAttribute(attribute, value);
    }
  });
}

function setLanguage(language, { persist = true } = {}) {
  const selectedLanguage = SUPPORTED_LANGUAGES.has(language)
    ? language
    : "pt-BR";
  const dictionary = translations[selectedLanguage];

  root.lang = selectedLanguage;
  document.title = dictionary.pageTitle;

  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = dictionary.metaDescription;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = dictionary[element.dataset.i18n];
    if (typeof value === "string") element.textContent = value;
  });

  setTranslatedAttribute(
    "[data-i18n-aria-label]",
    "aria-label",
    "i18nAriaLabel",
    dictionary,
  );
  setTranslatedAttribute(
    "[data-i18n-alt]",
    "alt",
    "i18nAlt",
    dictionary,
  );

  languageControls.forEach((control) => {
    control.setAttribute(
      "aria-pressed",
      String(control.dataset.language === selectedLanguage),
    );
  });

  window.CityPopTheme?.refreshLabels(dictionary);

  if (persist) {
    writeStorage(STORAGE.language, selectedLanguage);
  }
}

function preferredLanguage() {
  const stored = readStorage(STORAGE.language);
  if (SUPPORTED_LANGUAGES.has(stored)) return stored;
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "pt-BR";
}

function initialiseControls() {
  languageControls.forEach((control) => {
    control.addEventListener("click", () => {
      setLanguage(control.dataset.language);
    });
  });

  setLanguage(preferredLanguage(), { persist: false });
}

function initialiseReveal() {
  const targets = [...document.querySelectorAll("[data-reveal]")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("reveal-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("reveal-pending");
        entry.target.classList.add("reveal-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -5% 0px" },
  );

  targets.forEach((target) => {
    const isBelowFold = target.getBoundingClientRect().top > innerHeight * 0.9;

    if (isBelowFold) {
      target.classList.add("reveal-pending");
      observer.observe(target);
    } else {
      target.classList.add("reveal-visible");
    }
  });
}

function initialiseActiveNavigation() {
  const sections = [...document.querySelectorAll("main section[id]")];
  if (!("IntersectionObserver" in window) || sections.length === 0) return;

  const linksById = new Map(
    [...navLinks].map((link) => [link.getAttribute("href")?.slice(1), link]),
  );

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      navLinks.forEach((link) => link.removeAttribute("aria-current"));
      linksById.get(visible.target.id)?.setAttribute("aria-current", "location");
    },
    { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.15, 0.5] },
  );

  sections.forEach((section) => observer.observe(section));
}

initialiseControls();
initialiseReveal();
initialiseActiveNavigation();
