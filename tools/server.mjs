import { createReadStream } from "node:fs";
import http from "node:http";
import { stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT || 8146);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const base = pathname.startsWith("/src/")
        ? root
        : path.join(root, "public");
      const file = path.resolve(
        base,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(base + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const s = await stat(file);
      if (!s.isFile()) throw new Error("missing");
      const headers = {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
      };
      let start = 0,
        end = s.size - 1,
        status = 200;
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { "Content-Range": `bytes */${s.size}` }).end();
          return;
        }
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        } else start = Math.max(0, s.size - Number(match[2]));
        if (start > end || start >= s.size) {
          res.writeHead(416, { "Content-Range": `bytes */${s.size}` }).end();
          return;
        }
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${s.size}`;
      }
      headers["Content-Length"] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === "HEAD" || s.size === 0) {
        res.end();
        return;
      }
      const stream = createReadStream(file, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      res
        .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        .end("未找到资源");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Local: http://127.0.0.1:${port}`),
  );
