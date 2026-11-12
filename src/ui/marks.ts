import type { Mark, PackImage } from "../core/types.ts";
import { escapeText } from "../core/text.ts";

export const MARK_TYPES: Mark["type"][] = ["bold", "italic", "underline", "strike", "code"];

const EMOJI_SHORTCODE = /^:([a-zA-Z0-9-_]+):/;

function tag(type: Mark["type"]): [string, string] {
  switch (type) {
    case "bold":
      return ["<strong>", "</strong>"];
    case "italic":
      return ["<em>", "</em>"];
    case "underline":
      return ["<u>", "</u>"];
    case "strike":
      return ["<del>", "</del>"];
    default:
      return ["<code>", "</code>"];
  }
}

export function activeAt(marks: Mark[], index: number): Mark["type"][] {
  return marks.filter((mark) => index >= mark.start && index < mark.end).map((mark) => mark.type);
}

export function toggleMark(marks: Mark[], type: Mark["type"], start: number, end: number): Mark[] {
  if (start >= end) return marks;
  const covering = marks.some((mark) => mark.type === type && mark.start <= start && mark.end >= end);
  if (covering) return marks.filter((mark) => !(mark.type === type && mark.start <= start && mark.end >= end));
  return [...marks, { type, start, end }];
}

export function moveMarks(marks: Mark[], at: number, delta: number): Mark[] {
  return marks
    .map((mark) => {
      const start = mark.start >= at ? mark.start + delta : mark.start;
      const end = mark.end > at ? mark.end + delta : mark.end;
      return { ...mark, start: Math.max(0, start), end: Math.max(0, end) };
    })
    .filter((mark) => mark.end > mark.start);
}

/**
 * The formatted body of a draft. Null when neither a mark nor a custom emoji is
 * present, because a plain message must not carry a formatted body at all.
 */
export function serialize(text: string, marks: Mark[], emoji: Map<string, PackImage>): string | null {
  if (marks.length === 0 && emoji.size === 0) return null;
  let out = "";
  let index = 0;
  while (index < text.length) {
    const previous = activeAt(marks, index - 1);
    const current = activeAt(marks, index);
    for (const kind of MARK_TYPES.filter((entry) => previous.includes(entry) && !current.includes(entry)).toReversed()) {
      out += tag(kind)[1];
    }
    for (const kind of MARK_TYPES.filter((entry) => current.includes(entry) && !previous.includes(entry))) {
      out += tag(kind)[0];
    }
    const match = EMOJI_SHORTCODE.exec(text.slice(index));
    const image = match ? emoji.get(match[1] ?? "") : undefined;
    if (match && image) {
      const alt = escapeText(image.body);
      const title = escapeText(image.shortcode);
      out += `<img data-mx-emoticon src="${image.url}" alt="${alt}" title="${title}" height="32">`;
      index += match[0].length;
      continue;
    }
    const char = text[index] ?? "";
    out += char === "\n" ? "<br>" : escapeText(char);
    index += 1;
  }
  for (const kind of MARK_TYPES.filter((entry) => activeAt(marks, text.length - 1).includes(entry)).toReversed()) {
    out += tag(kind)[1];
  }
  return out;
}

export interface Segment {
  marks: Mark["type"][];
  text: string;
}

/** The draft as runs of text sharing the same marks, with emoji kept as text. */
export function segments(text: string, marks: Mark[]): Segment[] {
  const out: Segment[] = [];
  let index = 0;
  while (index < text.length) {
    const state = activeAt(marks, index);
    let end = index;
    while (end < text.length && activeAt(marks, end).join() === state.join()) end += 1;
    out.push({ marks: state, text: text.slice(index, end) });
    index = end;
  }
  return out;
}

/** The plain-text offset of a position inside a rendered draft. */
export function offsetOf(container: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  let found = false;
  const walk = (current: Node): void => {
    if (found) return;
    if (current === node) {
      if (current.nodeType === Node.TEXT_NODE) total += offset;
      else for (let index = 0; index < Math.min(offset, current.childNodes.length); index += 1) walk(current.childNodes[index] as Node);
      found = true;
      return;
    }
    if (current.nodeName === "BR") {
      total += 1;
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      total += (current.nodeValue ?? "").length;
      return;
    }
    for (const child of current.childNodes) walk(child);
  };
  for (const child of container.childNodes) walk(child);
  return total;
}
