import { describe, expect, it } from "vitest";
import { activeAt, moveMarks, segments, serialize, toggleMark } from "../src/ui/marks.ts";
import type { Mark, PackImage } from "../src/core/types.ts";

const image = (shortcode: string): PackImage => ({
  shortcode,
  body: shortcode,
  url: `mxc://example.org/${shortcode}`,
  info: null,
});

const emoji = new Map([["party", image("party")]]);

describe("marks", () => {
  it("toggles a mark over a selection", () => {
    const marks = toggleMark([], "bold", 0, 5);
    expect(marks).toEqual([{ type: "bold", start: 0, end: 5 }]);
    expect(toggleMark(marks, "bold", 1, 4)).toEqual([]);
  });

  it("keeps a partially covered mark", () => {
    const marks: Mark[] = [{ type: "italic", start: 2, end: 8 }];
    expect(toggleMark(marks, "italic", 0, 4)).toEqual([...marks, { type: "italic", start: 0, end: 4 }]);
  });

  it("reports the marks at a position", () => {
    expect(activeAt([{ type: "bold", start: 0, end: 3 }], 2)).toEqual(["bold"]);
    expect(activeAt([{ type: "bold", start: 0, end: 3 }], 3)).toEqual([]);
  });

  it("moves marks when text is inserted before them", () => {
    expect(moveMarks([{ type: "bold", start: 2, end: 4 }], 0, 1)).toEqual([{ type: "bold", start: 3, end: 5 }]);
  });

  it("groups the draft into segments with the same marks", () => {
    expect(segments("abc", [{ type: "bold", start: 0, end: 2 }])).toEqual([
      { marks: ["bold"], text: "ab" },
      { marks: [], text: "c" },
    ]);
  });
});

describe("serialize", () => {
  it("is null when nothing needs formatting", () => {
    expect(serialize("plain", [], new Map())).toBeNull();
  });

  it("nests marks and escapes text", () => {
    const html = serialize("a<b", [{ type: "bold", start: 0, end: 3 }], new Map());
    expect(html).toBe("<strong>a&lt;b</strong>");
  });

  it("turns a known shortcode into an emoji image and leaves unknown ones", () => {
    const html = serialize("hi :party: :nope:", [], emoji) ?? "";
    expect(html).toContain("<img data-mx-emoticon");
    expect(html).toContain("hi ");
    expect(html).toContain(":nope:");
  });

  it("nests two marks in a stable order however they were added", () => {
    const a = serialize("xy", [{ type: "italic", start: 0, end: 2 }, { type: "bold", start: 0, end: 2 }], new Map());
    const b = serialize("xy", [{ type: "bold", start: 0, end: 2 }, { type: "italic", start: 0, end: 2 }], new Map());
    expect(a).toBe("<strong><em>xy</em></strong>");
    expect(b).toBe(a);
  });

  it("keeps newlines as breaks", () => {
    expect(serialize("a\nb", [{ type: "italic", start: 0, end: 3 }], new Map())).toBe("<em>a<br>b</em>");
  });
});

describe("recovery key input", () => {
  it("drops spacing and formatting characters", async () => {
    const { normalizeRecoveryKey } = await import("../src/worker/api.ts");
    expect(normalizeRecoveryKey("EsTq 9mdU\nPW1w\tF6px")).toBe("EsTq9mdUPW1wF6px");
    expect(normalizeRecoveryKey("EsTq\u00a09mdU\u200bPW1w\ufeffF6px")).toBe("EsTq9mdUPW1wF6px");
  });
});
