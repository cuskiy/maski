import { createServer, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { contentSecurityPolicy } from "../src/lib/csp.ts";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const reviewRoot = fileURLToPath(new URL("../review-dist", import.meta.url));
const securityHeaders = {
  "content-security-policy": contentSecurityPolicy,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const;
const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
};

const COMPRESSIBLE: ReadonlySet<string> = new Set([".css", ".html", ".js", ".json", ".svg", ".wasm"]);

function compressible(extension: string): boolean {
  return COMPRESSIBLE.has(extension);
}

/** The worker and the crypto wasm are megabytes, so the preview pays for a round trip, not the wire. */
function preferredEncoding(header: string | undefined): "br" | "gzip" | null {
  if (header === undefined) return null;
  if (/\bbr\b/u.test(header)) return "br";
  if (/\bgzip\b/u.test(header)) return "gzip";
  return null;
}

async function compressed(body: Buffer, encoding: "br" | "gzip"): Promise<Buffer> {
  const zlib = await import("node:zlib");
  const run = encoding === "br" ? zlib.brotliCompress : zlib.gzip;
  return await new Promise<Buffer>((resolve, reject) => {
    run(body, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export interface ServeOptions {
  readonly reload?: boolean;
  readonly port?: number;
  readonly host?: string;
}

export interface Served {
  readonly notify: () => void;
  readonly port: number;
  readonly close: () => Promise<void>;
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

    const base = pathname.startsWith("/review/") ? reviewRoot : root;
    let file = join(base, normalize(pathname).replace(/^(\.\.(\/|\\|$))+/u, ""));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      let body: Buffer = await readFile(file);
      if (options.reload === true && extname(file) === ".html") {
        body = Buffer.from(body.toString("utf8").replace("</body>", '<script src="/__dev-reload.js"></script></body>'));
      }
      const asset = file.startsWith(join(root, "assets") + sep);
      const encoding = compressible(extname(file)) ? preferredEncoding(request.headers["accept-encoding"]) : null;
      if (encoding !== null) body = await compressed(body, encoding);
      response.writeHead(200, {
        ...securityHeaders,
        "content-type": types[extname(file)] ?? "application/octet-stream",
        "cache-control": asset ? "public, max-age=31536000, immutable" : "no-store",
        ...(encoding === null ? {} : { "content-encoding": encoding, vary: "accept-encoding" }),
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  const port = options.port ?? Number(process.env["PORT"] ?? "5072");
  const host = options.host ?? process.env["HOST"] ?? "127.0.0.1";
  server.listen(port, host, () => {
    const address = server.address();
    const actual = typeof address === "object" && address !== null ? address.port : port;
    process.stdout.write(`maski static → http://${host}:${String(actual)}/\n`);
  });

  return {
    notify,
    get port() {
      const address = server.address();
      return typeof address === "object" && address !== null ? address.port : port;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

if (import.meta.main) serve();
