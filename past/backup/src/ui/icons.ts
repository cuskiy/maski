// Geometry from Lucide (ISC): one 24px stroke grid, so every glyph in the shell
// shares weight, caps and alignment.
type Node =
  | readonly ["path", string]
  | readonly ["circle", number, number, number]
  | readonly ["line", number, number, number, number]
  | readonly ["rect", number, number, number, number, number];

const icons: Record<string, readonly Node[]> = {
  plus: [
    ["path", "M5 12h14"],
    ["path", "M12 5v14"],
  ],
  search: [
    ["path", "m21 21-4.34-4.34"],
    ["circle", 11, 11, 8],
  ],
  userPlus: [
    ["path", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"],
    ["circle", 9, 7, 4],
    ["line", 19, 8, 19, 14],
    ["line", 22, 11, 16, 11],
  ],
  users: [
    ["path", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"],
    ["path", "M16 3.128a4 4 0 0 1 0 7.744"],
    ["path", "M22 21v-2a4 4 0 0 0-3-3.87"],
    ["circle", 9, 7, 4],
  ],
  hash: [
    ["line", 4, 9, 20, 9],
    ["line", 4, 15, 20, 15],
    ["line", 10, 3, 8, 21],
    ["line", 16, 3, 14, 21],
  ],
  settings: [
    [
      "path",
      "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
    ],
    ["circle", 12, 12, 3],
  ],
  logout: [
    ["path", "m16 17 5-5-5-5"],
    ["path", "M21 12H9"],
    ["path", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"],
  ],
  arrowLeft: [["path", "m15 18-6-6 6-6"]],
  more: [
    ["circle", 12, 12, 1],
    ["circle", 19, 12, 1],
    ["circle", 5, 12, 1],
  ],
  send: [
    [
      "path",
      "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
    ],
    ["path", "m21.854 2.147-10.94 10.939"],
  ],
  paperclip: [
    [
      "path",
      "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
    ],
  ],
  smile: [
    ["circle", 12, 12, 9],
    ["path", "M8 14s1.5 2 4 2 4-2 4-2"],
    ["line", 9, 9, 9.01, 9],
    ["line", 15, 9, 15.01, 9],
  ],
  sticker: [
    [
      "path",
      "M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z",
    ],
    ["path", "M15 3v5a1 1 0 0 0 1 1h5"],
    ["line", 8, 13, 8.01, 13],
    ["line", 16, 13, 16.01, 13],
    ["path", "M10 16s.8 1 2 1c1.3 0 2-1 2-1"],
  ],
  close: [
    ["path", "M18 6 6 18"],
    ["path", "m6 6 12 12"],
  ],
  check: [["path", "M20 6 9 17l-5-5"]],
  download: [
    ["path", "M12 15V3"],
    ["path", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"],
    ["path", "m7 10 5 5 5-5"],
  ],
  reply: [
    ["path", "M20 18v-2a4 4 0 0 0-4-4H4"],
    ["path", "m9 17-5-5 5-5"],
  ],
  edit: [
    [
      "path",
      "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    ],
    ["path", "m15 5 4 4"],
  ],
  trash: [
    ["path", "M10 11v6"],
    ["path", "M14 11v6"],
    ["path", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"],
    ["path", "M3 6h18"],
    ["path", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  ],
  star: [
    [
      "path",
      "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
    ],
  ],
  bell: [
    ["path", "M10.268 21a2 2 0 0 0 3.464 0"],
    [
      "path",
      "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
    ],
  ],
  volume: [
    [
      "path",
      "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
    ],
    ["path", "M16 9a5 5 0 0 1 0 6"],
    ["path", "M19.364 18.364a9 9 0 0 0 0-12.728"],
  ],
  shield: [
    [
      "path",
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
  ],
  message: [
    [
      "path",
      "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
    ],
  ],
  image: [
    ["rect", 3, 3, 18, 18, 2],
    ["circle", 9, 9, 2],
    ["path", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"],
  ],
  file: [
    [
      "path",
      "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
    ],
    ["path", "M14 2v5a1 1 0 0 0 1 1h5"],
  ],
  video: [
    ["path", "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"],
    ["rect", 2, 6, 14, 12, 2],
  ],
  audio: [
    ["path", "M9 18V5l12-2v13"],
    ["circle", 6, 18, 3],
    ["circle", 18, 16, 3],
  ],
  chevron: [["path", "m9 18 6-6-6-6"]],
  person: [
    ["path", "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"],
    ["circle", 12, 7, 4],
  ],
  eye: [
    [
      "path",
      "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    ],
    ["circle", 12, 12, 3],
  ],
  key: [
    [
      "path",
      "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
    ],
    ["circle", 16.5, 7.5, 0.5],
  ],
  copy: [
    ["rect", 8, 8, 14, 14, 2],
    ["path", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  ],
};

const svgNs = "http://www.w3.org/2000/svg";

export function icon(name: string, label?: string): SVGSVGElement {
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", label ? "false" : "true");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  }
  for (const node of icons[name] ?? []) {
    svg.appendChild(shape(node));
  }
  return svg;
}

function shape(node: Node): SVGElement {
  const [tag, ...values] = node;
  const element = document.createElementNS(svgNs, tag);
  if (tag === "path") element.setAttribute("d", String(values[0]));
  if (tag === "circle") {
    element.setAttribute("cx", String(values[0]));
    element.setAttribute("cy", String(values[1]));
    element.setAttribute("r", String(values[2]));
  }
  if (tag === "line") {
    element.setAttribute("x1", String(values[0]));
    element.setAttribute("y1", String(values[1]));
    element.setAttribute("x2", String(values[2]));
    element.setAttribute("y2", String(values[3]));
  }
  if (tag === "rect") {
    element.setAttribute("x", String(values[0]));
    element.setAttribute("y", String(values[1]));
    element.setAttribute("width", String(values[2]));
    element.setAttribute("height", String(values[3]));
    element.setAttribute("rx", String(values[4]));
  }
  return element;
}

export function iconButton(
  label: string,
  name: string,
  onClick: (event: Event) => void,
  className = "icon-button",
): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.setAttribute("aria-label", label);
  node.title = label;
  node.appendChild(icon(name));
  node.addEventListener("click", onClick);
  return node;
}
