import { execFileSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translations } from "../src/assets/js/i18n.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const errors = [];

function fail(message) {
  errors.push(message);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}


function relativeLuminance(hex) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4);

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function localReference(value) {
  return value && !value.startsWith("#") && !/^(?:https?:|mailto:|tel:|data:)/i.test(value);
}

const htmlFiles = ["index.html", "404.html"];
const allI18nKeys = new Set();

for (const fileName of htmlFiles) {
  const absolute = path.join(sourceRoot, fileName);
  const html = await readFile(absolute, "utf8");

  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail(`${fileName}: inline script is not allowed`);
  if (/<style\b/i.test(html)) fail(`${fileName}: inline style blocks are not allowed`);
  if (/\sstyle\s*=/i.test(html)) fail(`${fileName}: style attributes are not allowed`);
  if (/\son[a-z]+\s*=/i.test(html)) fail(`${fileName}: inline event handlers are not allowed`);
  if (/http:\/\//i.test(html)) fail(`${fileName}: insecure HTTP URL found`);

  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    if (!/rel="[^"]*noopener[^"]*noreferrer[^"]*"/i.test(match[0])) {
      fail(`${fileName}: target=_blank link is missing noopener noreferrer`);
    }
  }

  for (const match of html.matchAll(/<(?:img|script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)) {
    const reference = match[1];
    if (localReference(reference) && !(await exists(path.resolve(sourceRoot, reference)))) {
      fail(`${fileName}: missing local file ${reference}`);
    }
  }

  for (const match of html.matchAll(/srcset="([^"]+)"/gi)) {
    for (const candidate of match[1].split(",")) {
      const reference = candidate.trim().split(/\s+/)[0];
      if (localReference(reference) && !(await exists(path.resolve(sourceRoot, reference)))) {
        fail(`${fileName}: missing srcset file ${reference}`);
      }
    }
  }

  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attributes = match[1];
    if (!/\balt="[^"]*"/i.test(attributes)) fail(`${fileName}: image without alt attribute`);
    if (!/\bwidth="\d+"/i.test(attributes) || !/\bheight="\d+"/i.test(attributes)) {
      fail(`${fileName}: image without explicit width and height`);
    }
  }

  for (const attribute of ["data-i18n", "data-i18n-aria-label", "data-i18n-alt"]) {
    for (const match of html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))) {
      allI18nKeys.add(match[1]);
    }
  }
}

for (const key of allI18nKeys) {
  for (const language of ["pt-BR", "en"]) {
    if (typeof translations[language]?.[key] !== "string") {
      fail(`Missing translation: ${language}.${key}`);
    }
  }
}

const contrastPairs = [
  ["light text", "#151512", "#f7f4ec"],
  ["light muted text", "#5c594f", "#f7f4ec"],
  ["dark text", "#f5f2e9", "#050505"],
  ["dark muted text", "#bbb5a8", "#050505"],
  ["light cyan", "#006f75", "#fffdf8"],
  ["light pink", "#a21f5b", "#fffdf8"],
  ["light violet", "#5240aa", "#fffdf8"],
];

for (const [name, foreground, background] of contrastPairs) {
  const ratio = contrastRatio(foreground, background);
  if (ratio < 4.5) fail(`${name}: contrast ratio ${ratio.toFixed(2)} is below 4.5:1`);
}

const infrastructure = await readFile(path.join(projectRoot, "infra/cloudformation.yml"), "utf8");
for (const requirement of [
  "BlockPublicAcls: true",
  "BlockPublicPolicy: true",
  "RestrictPublicBuckets: true",
  "OriginAccessControl",
  "ViewerProtocolPolicy: redirect-to-https",
  "ContentSecurityPolicy",
]) {
  if (!infrastructure.includes(requirement)) fail(`Infrastructure is missing: ${requirement}`);
}
if (/unsafe-inline|unsafe-eval/.test(infrastructure)) fail("Infrastructure CSP contains an unsafe directive");
if (/Principal:\s*["']?\*["']?/.test(infrastructure)) fail("Infrastructure contains a wildcard principal");

for (const fileName of ["app.js", "theme-init.js", "i18n.js"]) {
  const absolute = path.join(sourceRoot, "assets/js", fileName);
  const source = await readFile(absolute, "utf8");
  if (/\b(?:eval|Function)\s*\(/.test(source)) fail(`${fileName}: dynamic code execution found`);
  if (/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/.test(source)) {
    fail(`${fileName}: unsafe HTML injection API found`);
  }
  execFileSync(process.execPath, ["--check", absolute], { stdio: "pipe" });
}

execFileSync("bash", ["-n", path.join(projectRoot, "scripts/deploy.sh")], { stdio: "pipe" });

const filesToScan = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    if (entry.isFile()) filesToScan.push(absolute);
  }
}
await collect(projectRoot);

for (const absolute of filesToScan.filter((file) => !file.includes(`${path.sep}dist${path.sep}`))) {
  const content = await readFile(absolute, "utf8").catch(() => "");
  if (/AKIA[0-9A-Z]{16}/.test(content)) fail(`${path.relative(projectRoot, absolute)}: AWS access key pattern found`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    fail(`${path.relative(projectRoot, absolute)}: private key found`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validation passed: ${allI18nKeys.size} translated keys, no unsafe inline code, no missing assets.`);
