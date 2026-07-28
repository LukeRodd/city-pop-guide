import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(
  path.join(projectRoot, "src/assets/js/theme-init.js"),
  "utf8",
);

class MockElement {
  constructor() {
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.content = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }

  click() {
    this.listeners.get("click")?.({ type: "click", currentTarget: this });
  }
}

const control = new MockElement();
const label = new MockElement();
const meta = new MockElement();
const documentListeners = new Map();
const storage = new Map();
const dispatchedEvents = [];

const root = {
  dataset: {},
  lang: "pt-BR",
  classList: { add() {} },
};

const document = {
  documentElement: root,
  readyState: "loading",
  querySelector(selector) {
    return new Map([
      ["[data-theme-control]", control],
      ["[data-theme-label]", label],
      ["#theme-color", meta],
    ]).get(selector) ?? null;
  },
  addEventListener(type, callback) {
    documentListeners.set(type, callback);
  },
};

class MockCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const window = {
  dispatchEvent(event) {
    dispatchedEvents.push(event);
    return true;
  },
};

const context = {
  CustomEvent: MockCustomEvent,
  document,
  localStorage: {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  },
  matchMedia() {
    return { matches: false };
  },
  window,
};

vm.runInNewContext(source, context, { filename: "theme-init.js" });

assert.equal(root.dataset.theme, "light", "initial theme should be light");
documentListeners.get("DOMContentLoaded")?.();
assert.equal(label.textContent, "NOITE", "button should offer the dark theme");
assert.equal(control.getAttribute("aria-pressed"), "false");

control.click();
assert.equal(root.dataset.theme, "dark", "first click should enable dark theme");
assert.equal(label.textContent, "DIA", "button should offer the light theme");
assert.equal(control.getAttribute("aria-pressed"), "true");
assert.equal(storage.get("city-pop-theme"), "dark");
assert.equal(meta.content, "#050505");

control.click();
assert.equal(root.dataset.theme, "light", "second click should restore light theme");
assert.equal(label.textContent, "NOITE");
assert.equal(control.getAttribute("aria-pressed"), "false");
assert.equal(storage.get("city-pop-theme"), "light");
assert.equal(meta.content, "#f7f4ec");

root.lang = "en";
window.CityPopTheme.refreshLabels({
  themeToDark: "Enable dark mode",
  themeToLight: "Enable light mode",
  themeDarkLabel: "DARK",
  themeLightLabel: "LIGHT",
});
assert.equal(label.textContent, "DARK");
assert.equal(control.getAttribute("aria-label"), "Enable dark mode");

assert.equal(dispatchedEvents.length, 2, "each user toggle should emit one event");
assert.deepEqual(
  dispatchedEvents.map((event) => event.detail.theme),
  ["dark", "light"],
);

console.log("Theme controller passed: light → dark → light, persistence and labels.");
