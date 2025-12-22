import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number.parseInt(process.env.PORT || "4173", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function safePath(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0];
  const rel = clean === "/" ? "/index.html" : clean;
  const decoded = decodeURIComponent(rel);
  const full = path.resolve(rootDir, `.${decoded}`);
  if (!full.startsWith(rootDir)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    const file = safePath(req.url || "/");
    if (!file) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TermoTV dev server: http://127.0.0.1:${port}/`);
});
