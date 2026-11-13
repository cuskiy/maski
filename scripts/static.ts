import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
};

/** The dev-time reload talks to this; a built site never sees it. */
function injection(): string {
  return `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;
}

export interface ServeOptions {
  readonly reload?: boolean;
}

export function serve(root: string, port: number, options: ServeOptions = {}): Promise<{ close: () => void }> {
  let version = 0;
  const clients = new Set<{ write: (chunk: string) => void }>();

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/__reload") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      response.write(": connected\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (url.pathname === "/__version") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ version }));
      return;
    }

    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/u, "");
    if (path.endsWith("/")) path += "index.html";
    try {
      let body = await readFile(join(root, path));
      if (options.reload === true && path.endsWith(".html")) {
        body = Buffer.from(body.toString("utf8").replace("</body>", `${injection()}</body>`));
      }
      response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    } catch {
      const fallback = await readFile(join(root, "404.html")).catch(() => null);
      const body = fallback ?? Buffer.from("not found");
      response.writeHead(404, { "content-type": fallback === null ? "text/plain" : "text/html; charset=utf-8" });
      response.end(body);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const timer = options.reload === true ? setInterval(async () => {
        const stamp = await stat(join(root, "index.html")).then((info) => info.mtimeMs).catch(() => 0);
        if (stamp === version) return;
        version = stamp;
        for (const client of clients) client.write(`data: ${String(version)}\n\n`);
      }, 400) : null;
      resolve({
        close: () => {
          if (timer !== null) clearInterval(timer);
          server.close();
        },
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../dist", import.meta.url));
  const port = Number(process.env["PORT"] ?? 5173);
  await serve(root, port);
  process.stdout.write(`serving dist on http://localhost:${String(port)}/\n`);
}
