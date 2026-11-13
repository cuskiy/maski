const KEY = "maski:sections";

function stored(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return typeof value === "object" && value !== null ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** The section state outlives the page: a closed section stays closed, per browser. */
export function restoreSections(): void {
  const open = stored();
  for (const section of document.querySelectorAll<HTMLDetailsElement>("details[data-section]")) {
    const id = section.dataset["section"] ?? "";
    section.open = open[id] === true;
    section.addEventListener("toggle", () => {
      const next = stored();
      next[id] = section.open;
      localStorage.setItem(KEY, JSON.stringify(next));
    });
  }
}
