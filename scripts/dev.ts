import { createServer } from "vite";
import { generateShells } from "./shells";

generateShells();
const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
server.printUrls();
