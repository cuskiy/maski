import { App } from "./app";

const root = document.getElementById("app");
if (!root) throw new Error("Missing app root");

const app = new App(root);
void app.start();
