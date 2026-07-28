import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "dist");
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
]);

const securityHeaders = Object.freeze({
  "Content-Security-Policy": "default-src 'none'; base-uri 'self'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; manifest-src 'self'; media-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requestPath = decoded === "/" ? "/index.html" : decoded;
  const absolute = path.resolve(publicRoot, `.${requestPath}`);
  return absolute.startsWith(`${publicRoot}${path.sep}`) ? absolute : null;
}

createServer(async (request, response) => {
  Object.entries(securityHeaders).forEach(([name, value]) => response.setHeader(name, value));
  response.setHeader("Cache-Control", "no-store");

  if (!new Set(["GET", "HEAD"]).has(request.method ?? "")) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let absolute = safePath(request.url ?? "/");
  let statusCode = 200;

  try {
    if (!absolute || !(await stat(absolute)).isFile()) throw new Error("not found");
  } catch {
    absolute = path.join(publicRoot, "404.html");
    statusCode = 404;
  }

  try {
    const body = await readFile(absolute);
    response.writeHead(statusCode, {
      "Content-Type": mimeTypes.get(path.extname(absolute)) ?? "application/octet-stream",
      "Content-Length": body.byteLength,
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Build not found. Run npm run build first.\n");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Local server: http://127.0.0.1:${port}`);
});
