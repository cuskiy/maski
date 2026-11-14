import { createServer, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
};

export interface ServeOptions {
  readonly reload?: boolean;
}

export interface Served {
  readonly notify: () => void;
}

export function serve(options: ServeOptions = {}): Served {
  const clients = new Set<ServerResponse>();
  const notify = (): void => {
    for (const client of clients) client.write("data: reload\n\n");
  };

  const server = createServer(async (request, response) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Bad Request");
      return;
    }

    if (options.reload === true && pathname === "/__dev-reload.js") {
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end('const source = new EventSource("/__dev-reload"); source.onmessage = () => location.reload();\n');
      return;
    }

    if (options.reload === true && pathname === "/__dev-reload") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      response.write("retry: 1000\n\n");
      clients.add(response);
      request.on("close", () => {
        clients.delete(response);
      });
      return;
    }

    let file = join(root, normalize(pathname).replace(/^(\.\.(\/|\\|$))+/u, ""));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      let body = await readFile(file);
      if (options.reload === true && extname(file) === ".html") {
        body = Buffer.from(body.toString("utf8").replace("</body>", '<script src="/__dev-reload.js"></script></body>'));
      }
      const asset = file.startsWith(join(root, "assets") + sep);
      response.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
        "cache-control": asset ? "public, max-age=31536000, immutable" : "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  server.listen(Number(process.env["PORT"] ?? "5172"), process.env["HOST"] ?? "127.0.0.1", () => {
    process.stdout.write(
      `maski static → http://${process.env["HOST"] ?? "127.0.0.1"}:${process.env["PORT"] ?? "5172"}/\n`,
    );
  });

  return { notify };
}

if (import.meta.main) serve();
