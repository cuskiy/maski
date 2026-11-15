const DEV_HOSTS: Readonly<Record<string, true>> = {
  localhost: true,
  "127.0.0.1": true,
  "[::1]": true,
  "::1": true,
};

/** Registration is production-only; the dev server and loopback stay unregistered. */
export function isProductionOrigin(protocol: string, hostname: string): boolean {
  return protocol === "https:" && DEV_HOSTS[hostname] !== true;
}

function afterLoad(task: () => void): void {
  if (document.readyState === "complete") {
    setTimeout(task, 0);
    return;
  }
  window.addEventListener(
    "load",
    () => {
      setTimeout(task, 0);
    },
    { once: true },
  );
}

export function registerShell(): void {
  if (!isProductionOrigin(location.protocol, location.hostname)) return;
  if (document.documentElement.dataset["page"] === "review") return;
  if (!("serviceWorker" in navigator)) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="service-worker"]');
  const url = meta?.content ?? "";
  if (url === "") return;

  afterLoad(() => {
    void navigator.serviceWorker.register(url, { updateViaCache: "none" }).catch(() => undefined);
  });
}
