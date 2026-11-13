import { App } from "./app.ts";

const root = document.getElementById("app");
if (root) {
  const app = new App(root);
  void app.boot().then(() => {
    document.getElementById("boot")?.remove();
  });
}
