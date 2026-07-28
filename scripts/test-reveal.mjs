import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const application = await readFile(
  path.join(projectRoot, "src/assets/js/app.js"),
  "utf8",
);
const stylesheet = await readFile(
  path.join(projectRoot, "src/assets/css/main.css"),
  "utf8",
);

const requiredApplicationPatterns = [
  'scrollDirection = currentScrollY > previousScrollY ? "down" : "up"',
  'setPending(entry.target, "top")',
  'setPending(entry.target, "bottom")',
  "observer.observe(target)",
];

const requiredStylePatterns = [
  ".reveal-pending.reveal-from-bottom",
  "transform: translateY(1.25rem)",
  ".reveal-pending.reveal-from-top",
  "transform: translateY(-1.25rem)",
];

const errors = [];

for (const pattern of requiredApplicationPatterns) {
  if (!application.includes(pattern)) {
    errors.push(`app.js is missing reversible reveal behaviour: ${pattern}`);
  }
}

for (const pattern of requiredStylePatterns) {
  if (!stylesheet.includes(pattern)) {
    errors.push(`main.css is missing reversible reveal style: ${pattern}`);
  }
}

if (application.includes("observer.unobserve(entry.target)")) {
  errors.push("Reveal targets must remain observed after becoming visible");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Reveal animation passed: down and up directions remain observable.");
