type PositionVariable = "--nav-menu-left" | "--nav-menu-top" | "--nav-menu-width" | "--context-x" | "--context-y";

let root: CSSStyleRule | null = null;

function positionRule(): CSSStyleRule {
  if (root !== null) return root;

  const sheet = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.sheet;
  if (sheet === null || sheet === undefined) throw new Error("The app stylesheet is missing");

  const index = sheet.insertRule(
    ":root { --nav-menu-left: 0px; --nav-menu-top: 0px; --nav-menu-width: var(--floating-width); --context-x: 0px; --context-y: 0px; }",
    sheet.cssRules.length,
  );
  const rule = sheet.cssRules[index];
  if (rule === undefined || !("style" in rule)) throw new Error("The position rule is not a style rule");

  root = rule as CSSStyleRule;
  return root;
}

export function setPosition(name: PositionVariable, value: string): void {
  positionRule().style.setProperty(name, value);
}

export function clearPosition(name: PositionVariable): void {
  positionRule().style.removeProperty(name);
}
