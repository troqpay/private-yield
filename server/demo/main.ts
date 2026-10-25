import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

// The open demo's server: the built page (dist/) and the SPP SDK package,
// served untouched because the SDK resolves its workers, WASM and circuits
// relative to its own files (see vite.config.ts). Node >= 22.18 runs this
// file directly, with no build step.

const ROOT = resolve(import.meta.dirname, "..", "..");
const SDK_PREFIX = "/node_modules/stellar-private-payments/";
const SDK_DIR = join(ROOT, "node_modules", "stellar-private-payments");
const DIST_DIR = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 8080);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".r1cs": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

async function serveFile(response: ServerResponse, dir: string, relativePath: string, cache: string): Promise<boolean> {
  const path = resolve(dir, relativePath);
  if (path !== dir && !path.startsWith(dir + sep)) return false;
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return false;
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(path).pipe(response);
  return true;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  if (pathname.startsWith(SDK_PREFIX)) {
    // The package version is pinned, so its files never change at a URL.
    const served = await serveFile(response, SDK_DIR, pathname.slice(SDK_PREFIX.length), "public, max-age=604800, immutable");
    if (!served) response.writeHead(404).end();
    return;
  }
  if (pathname.startsWith("/assets/")) {
    const served = await serveFile(response, DIST_DIR, pathname.slice(1), "public, max-age=31536000, immutable");
    if (!served) response.writeHead(404).end();
    return;
  }
  await serveFile(response, DIST_DIR, "index.html", "no-cache");
}

createServer((request, response) => {
  handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
}).listen(PORT, () => console.log(`private-yield demo on :${PORT}`));
