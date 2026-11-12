import { build } from "vite";
import { generateShells } from "./shells";
import { verify } from "./verify";

generateShells();
await build({ configFile: "vite.config.ts" });
await verify();
