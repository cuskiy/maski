import type { EmojiToken, MarkKind, TextMark } from "../data/records";

export type MarkType = MarkKind;

export interface ComposerState {
  text: string;
  marks: TextMark[];
  tokens: EmojiToken[];
  selectionStart: number;
  selectionEnd: number;
}

export interface SerializedComposer {
  body: string;
  formattedBody: string | null;
}

export const inlineMarks: readonly MarkType[] = ["bold", "italic", "underline", "strike", "code"];
export const blockMarks: readonly MarkType[] = ["heading", "quote", "codeBlock"];

const markOrder: readonly MarkType[] = [...inlineMarks];
const markTags: Record<Exclude<MarkType, "heading" | "quote" | "codeBlock">, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "del",
  code: "code",
};
function isBlock(mark: MarkType): mark is "heading" | "quote" | "codeBlock" {
  return mark === "heading" || mark === "quote" || mark === "codeBlock";
}

function lineStartOf(text: string, index: number): number {
  const breakIndex = text.lastIndexOf("\n", Math.max(0, index - 1));
  return index === 0 || breakIndex < 0 ? 0 : breakIndex + 1;
}

function lineEndOf(text: string, index: number): number {
  const breakIndex = text.indexOf("\n", index);
  return breakIndex < 0 ? text.length : breakIndex;
}

export class ComposerModel {
  private text = "";
  private marks: TextMark[] = [];
  private tokens: EmojiToken[] = [];
  private selectionStart = 0;
  private selectionEnd = 0;
  private history: ComposerState[] = [];
  private future: ComposerState[] = [];

  get value(): string {
    return this.text;
  }

  get state(): ComposerState {
    return {
      text: this.text,
      marks: this.marks.map((mark) => ({ ...mark })),
      tokens: this.tokens.map((token) => ({ ...token })),
      selectionStart: this.selectionStart,
      selectionEnd: this.selectionEnd,
    };
  }

  setSelection(start: number, end = start): void {
    const length = this.text.length;
    this.selectionStart = clamp(start, 0, length);
    this.selectionEnd = clamp(end, this.selectionStart, length);
  }

  get selection(): { start: number; end: number; collapsed: boolean } {
    return {
      start: this.selectionStart,
      end: this.selectionEnd,
      collapsed: this.selectionStart === this.selectionEnd,
    };
  }

  applyInput(value: string, selectionStart: number, selectionEnd: number): void {
    if (value === this.text) {
      this.setSelection(selectionStart, selectionEnd);
      return;
    }
    const old = this.text;
    let prefix = 0;
    while (prefix < old.length && prefix < value.length && old[prefix] === value[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < old.length - prefix &&
      suffix < value.length - prefix &&
      old[old.length - 1 - suffix] === value[value.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    const inserted = value.slice(prefix, value.length - suffix);
    this.pushHistory();
    this.replaceRange(prefix, old.length - suffix, inserted);
    this.setSelection(selectionStart, selectionEnd);
    this.future = [];
  }

  insertText(value: string): void {
    if (!value) return;
    this.pushHistory();
    const start = this.selection.start;
    const end = this.selection.end;
    this.replaceRange(start, end, value);
    this.selectionStart = start + value.length;
    this.selectionEnd = this.selectionStart;
  }

  deleteSelection(): void {
    const start = this.selection.start;
    const end = this.selection.end;
    if (start === end) return;
    this.pushHistory();
    this.replaceRange(start, end, "");
    this.selectionStart = start;
    this.selectionEnd = start;
  }

  toggleMark(type: MarkType): void {
    if (this.selection.collapsed) return;
    this.pushHistory();
    this.marks = isBlock(type) ? this.toggleBlock(type) : this.toggleInline(type);
    this.future = [];
  }

  private toggleInline(type: MarkType): TextMark[] {
    const start = this.selection.start;
    const end = this.selection.end;
    const existing = this.marks.find(
      (mark) => mark.type === type && mark.start === start && mark.end === end,
    );
    if (existing) return this.marks.filter((mark) => mark !== existing);
    return mergeMarks([...this.marks, { type, start, end }]);
  }

  // A block style covers whole lines and replaces any other block style on them.
  private toggleBlock(type: MarkType): TextMark[] {
    const from = lineStartOf(this.text, this.selection.start);
    const to = lineEndOf(this.text, Math.max(this.selection.start, this.selection.end - 1));
    const lines: { start: number; end: number }[] = [];
    let cursor = from;
    while (cursor <= to) {
      const end = lineEndOf(this.text, cursor);
      lines.push({ start: cursor, end });
      cursor = end + 1;
    }
    const already = lines.every((line) =>
      this.marks.some((mark) => mark.type === type && mark.start === line.start && mark.end === line.end),
    );
    const kept = this.marks.filter(
      (mark) => !(isBlock(mark.type) && lines.some((line) => mark.start === line.start)),
    );
    if (already) return kept;
    return mergeMarks([...kept, ...lines.map((line) => ({ type, start: line.start, end: line.end }))]);
  }

  activeMarks(): Set<MarkType> {
    const start = this.selection.start;
    const end = this.selection.end;
    const active = new Set<MarkType>();
    if (start === end) {
      for (const mark of this.marks) {
        if (mark.start < start && mark.end >= start) active.add(mark.type);
      }
      return active;
    }
    for (const mark of this.marks) {
      if (mark.start <= start && mark.end >= end) active.add(mark.type);
    }
    return active;
  }

  insertEmoji(shortcode: string, url: string, body: string, info: Record<string, unknown>): void {
    this.pushHistory();
    const literal = `:${shortcode}:`;
    const start = this.selection.start;
    const end = this.selection.end;
    this.replaceRange(start, end, literal);
    this.tokens = this.tokens.filter((token) => token.end <= start || token.start >= start + literal.length);
    this.tokens.push({ shortcode, start, end: start + literal.length, url, body, info });
    this.tokens = this.tokens.toSorted((a, b) => a.start - b.start);
    this.selectionStart = start + literal.length;
    this.selectionEnd = this.selectionStart;
    this.future = [];
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(this.state);
    this.restore(previous);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.state);
    this.restore(next);
  }

  restoreState(state: ComposerState): void {
    this.restore(state);
  }

  clear(): void {
    this.pushHistory();
    this.text = "";
    this.marks = [];
    this.tokens = [];
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.future = [];
  }

  serialize(): SerializedComposer {
    if (this.marks.length === 0 && this.tokens.length === 0) {
      return { body: this.text, formattedBody: null };
    }
    return { body: this.text, formattedBody: this.toHtml(true) };
  }

  previewHtml(): string {
    return this.toHtml(false);
  }

  private replaceRange(start: number, end: number, value: string): void {
    this.text = this.text.slice(0, start) + value + this.text.slice(end);
    this.marks = mergeMarks(
      this.marks
        .map((mark) => shiftMark(mark, start, end, value.length))
        .filter((mark): mark is TextMark => mark !== null),
    );
    this.tokens = this.tokens
      .map((token) => shiftToken(token, start, end, value.length))
      .filter((token): token is EmojiToken => token !== null);
  }

  private pushHistory(): void {
    this.history.push(this.state);
    if (this.history.length > 50) this.history.shift();
  }

  private restore(state: ComposerState): void {
    this.text = state.text;
    this.marks = state.marks.map((mark) => ({ ...mark }));
    this.tokens = state.tokens.map((token) => ({ ...token }));
    this.selectionStart = state.selectionStart;
    this.selectionEnd = state.selectionEnd;
  }

  private toHtml(wrapParagraph: boolean): string {
    const lines = this.lines();
    if (lines.some((line) => line.block)) {
      const blocks = lines.map((line) => {
        const inline = this.inlineHtml(line.start, line.end);
        if (line.block === "heading") return `<h3>${inline}</h3>`;
        if (line.block === "quote") return `<blockquote><p>${inline}</p></blockquote>`;
        if (line.block === "codeBlock") return `<pre><code>${this.text.slice(line.start, line.end)}</code></pre>`;
        return `<p>${inline}</p>`;
      });
      return blocks.join("");
    }
    const content = this.inlineHtml(0, this.text.length);
    return wrapParagraph ? `<p>${content}</p>` : content;
  }

  // One entry per line, with the block mark that covers it, if any.
  lines(): { start: number; end: number; block: "heading" | "quote" | "codeBlock" | null }[] {
    const result: { start: number; end: number; block: "heading" | "quote" | "codeBlock" | null }[] = [];
    let cursor = 0;
    while (cursor <= this.text.length) {
      const end = lineEndOf(this.text, cursor);
      const block = this.marks.find(
        (mark) => mark.start === cursor && mark.end === end && isBlock(mark.type),
      );
      result.push({ start: cursor, end, block: block && isBlock(block.type) ? block.type : null });
      if (end >= this.text.length) break;
      cursor = end + 1;
    }
    return result;
  }

  private inlineHtml(from: number, to: number): string {
    const parts: string[] = [];
    let open = new Set<MarkType>();
    let index = from;
    while (index < to) {
      const token = this.tokens.find((candidate) => candidate.start === index);
      if (token) {
        if (open.size > 0) {
          parts.push(closeMarks(open));
          open = new Set();
        }
        parts.push(
          `<img data-mx-emoticon src="${escapeAttribute(token.url)}" alt="${escapeAttribute(token.body)}" title="${escapeAttribute(token.shortcode)}" height="32">`,
        );
        index = token.end;
        continue;
      }
      const nextToken = this.tokens.find((candidate) => candidate.start > index);
      const limit = Math.min(nextToken?.start ?? this.text.length, to);
      const active = new Set(
        this.marks
          .filter((mark) => !isBlock(mark.type) && mark.start <= index && mark.end > index)
          .map((mark) => mark.type),
      );
      if (!sameMarks(open, active)) {
        parts.push(closeMarks(open));
        open = new Set(active);
        parts.push(openMarks(open));
      }
      const codePoint = this.text.slice(index, limit).codePointAt(0);
      const character = codePoint === undefined ? "" : String.fromCodePoint(codePoint);
      if (character === "\n") parts.push("<br>");
      else parts.push(escapeText(character));
      index += character.length;
    }
    parts.push(closeMarks(open));
    return parts.join("");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shiftMark(mark: TextMark, start: number, end: number, inserted: number): TextMark | null {
  const deleted = end - start;
  if (mark.end <= start) return mark;
  if (mark.start >= end) return { ...mark, start: mark.start - deleted + inserted, end: mark.end - deleted + inserted };
  const nextStart = mark.start < start ? mark.start : start + inserted;
  const nextEnd = mark.end > end ? mark.end - deleted + inserted : start + inserted;
  return nextEnd > nextStart ? { ...mark, start: nextStart, end: nextEnd } : null;
}

function shiftToken(token: EmojiToken, start: number, end: number, inserted: number): EmojiToken | null {
  const deleted = end - start;
  if (token.end <= start) return token;
  if (token.start >= end) return { ...token, start: token.start - deleted + inserted, end: token.end - deleted + inserted };
  return null;
}

function mergeMarks(marks: readonly TextMark[]): TextMark[] {
  const sorted = marks.toSorted((a, b) => a.start - b.start || a.end - b.end);
  const result: TextMark[] = [];
  for (const mark of sorted) {
    const previous = result[result.length - 1];
    if (previous && previous.type === mark.type && previous.end >= mark.start) {
      previous.end = Math.max(previous.end, mark.end);
    } else {
      result.push({ ...mark });
    }
  }
  return result;
}

function sameMarks(left: ReadonlySet<MarkType>, right: ReadonlySet<MarkType>): boolean {
  if (left.size !== right.size) return false;
  for (const mark of left) if (!right.has(mark)) return false;
  return true;
}

function openMarks(marks: ReadonlySet<MarkType>): string {
  return markOrder
    .filter((mark) => marks.has(mark) && !isBlock(mark))
    .map((mark) => `<${markTags[mark as keyof typeof markTags]}>`)
    .join("");
}

function closeMarks(marks: ReadonlySet<MarkType>): string {
  return markOrder
    .toReversed()
    .filter((mark) => marks.has(mark) && !isBlock(mark))
    .map((mark) => `</${markTags[mark as keyof typeof markTags]}>`)
    .join("");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}
