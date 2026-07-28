import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const outputRoot = path.join(projectRoot, "dist");
const assetRoot = path.join(sourceRoot, "assets");
const mapping = new Map();

function fingerprint(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 10);
}

function fingerprintedPath(relativePath, buffer) {
  const extension = path.extname(relativePath);
  const base = relativePath.slice(0, -extension.length);
  return `${base}.${fingerprint(buffer)}${extension}`;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }

  return files;
}

async function writeAsset(relativePath, buffer) {
  const outputRelative = fingerprintedPath(relativePath, buffer);
  const outputAbsolute = path.join(outputRoot, outputRelative);
  await mkdir(path.dirname(outputAbsolute), { recursive: true });
  await writeFile(outputAbsolute, buffer);
  mapping.set(relativePath.split(path.sep).join("/"), outputRelative.split(path.sep).join("/"));
}

function rewriteReferences(content) {
  return [...mapping.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .reduce((result, [source, output]) => result.replaceAll(source, output), content);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const assetFiles = await listFiles(assetRoot);
const deferredApp = assetFiles.find((file) => file.endsWith(`${path.sep}assets${path.sep}js${path.sep}app.js`));
const deferredI18n = assetFiles.find((file) => file.endsWith(`${path.sep}assets${path.sep}js${path.sep}i18n.js`));

for (const absolutePath of assetFiles) {
  const relativePath = path.relative(sourceRoot, absolutePath);
  if (absolutePath === deferredApp || absolutePath === deferredI18n) continue;
  await writeAsset(relativePath, await readFile(absolutePath));
}

if (!deferredApp || !deferredI18n) {
  throw new Error("src/assets/js/app.js or i18n.js was not found");
}

const sourceApp = await readFile(deferredApp, "utf8");
const sourceI18n = await readFile(deferredI18n, "utf8");
const bundledI18n = sourceI18n.replace(
  /^export const translations =/,
  "const translations =",
);
const bundledApp = sourceApp.replace(
  /^import \{ translations \} from "\.\/i18n\.js";\s*/,
  "",
);
const applicationBundle = `"use strict";\n\n${bundledI18n}\n\n${bundledApp}`;
await writeAsset("assets/js/app.js", Buffer.from(applicationBundle));

for (const fileName of ["index.html", "404.html", "site.webmanifest"]) {
  const source = await readFile(path.join(sourceRoot, fileName), "utf8");
  const rewritten = rewriteReferences(source).replace(
    /<script type="module" src="(assets\/js\/app\.[^"]+\.js)"><\/script>/,
    '<script defer src="$1"></script>',
  );
  await writeFile(path.join(outputRoot, fileName), rewritten);
}

await cp(path.join(sourceRoot, "robots.txt"), path.join(outputRoot, "robots.txt"));
await writeFile(
  path.join(outputRoot, "asset-manifest.json"),
  `${JSON.stringify(Object.fromEntries(mapping), null, 2)}\n`,
);

const builtIndex = await readFile(path.join(outputRoot, "index.html"), "utf8");
const builtApplicationPath = mapping.get("assets/js/app.js");
const builtApplication = await readFile(path.join(outputRoot, builtApplicationPath), "utf8");

if (builtIndex.includes('type="module"')) {
  throw new Error("The production HTML still contains an ES module script");
}
if (/^\s*(?:import|export)\s/m.test(builtApplication)) {
  throw new Error("The production application bundle still contains module syntax");
}

console.log(`Built ${mapping.size} fingerprinted assets in dist/`);
