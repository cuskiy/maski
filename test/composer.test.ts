import { describe, expect, it } from "vitest";
import { ComposerModel } from "../src/ui/composer-model";

describe("ComposerModel", () => {
  it("tracks a selection and toggles marks", () => {
    const model = new ComposerModel();
    model.applyInput("hello world", 11, 11);
    model.setSelection(0, 5);
    model.toggleMark("bold");
    expect(model.state.marks).toEqual([{ type: "bold", start: 0, end: 5 }]);
    expect(model.previewHtml()).toBe("<strong>hello</strong> world");
  });

  it("serializes plain text without formatted body", () => {
    const model = new ComposerModel();
    model.applyInput("plain", 5, 5);
    expect(model.serialize()).toEqual({ body: "plain", formattedBody: null });
  });

  it("serializes marks into formatted body", () => {
    const model = new ComposerModel();
    model.applyInput("hello", 5, 5);
    model.setSelection(0, 5);
    model.toggleMark("italic");
    expect(model.serialize()).toEqual({
      body: "hello",
      formattedBody: "<p><em>hello</em></p>",
    });
  });

  it("inserts and serializes a custom emoji token", () => {
    const model = new ComposerModel();
    model.applyInput("hi ", 3, 3);
    model.insertEmoji("party", "mxc://example/party", "party", { w: 32, h: 32 });
    expect(model.value).toBe("hi :party:");
    expect(model.serialize().formattedBody).toContain(
      '<img data-mx-emoticon src="mxc://example/party" alt="party" title="party" height="32">',
    );
  });

  it("supports undo and redo", () => {
    const model = new ComposerModel();
    model.applyInput("a", 1, 1);
    model.applyInput("ab", 2, 2);
    model.undo();
    expect(model.value).toBe("a");
    model.redo();
    expect(model.value).toBe("ab");
  });

  it("drops a token when its text is edited", () => {
    const model = new ComposerModel();
    model.insertEmoji("wave", "mxc://example/wave", "wave", {});
    model.applyInput(":wave", 5, 5);
    expect(model.state.tokens).toHaveLength(0);
  });
});

describe("block marks", () => {
  it("wraps the selected lines and replaces another block style", () => {
    const model = new ComposerModel();
    model.applyInput("first line\nsecond line", 3, 3);
    model.setSelection(0, 5);
    model.toggleMark("heading");
    expect(model.serialize().formattedBody).toBe("<h3>first line</h3><p>second line</p>");
    model.toggleMark("quote");
    expect(model.serialize().formattedBody).toBe("<blockquote><p>first line</p></blockquote><p>second line</p>");
  });

  it("removes the block style when the same selection is toggled again", () => {
    const model = new ComposerModel();
    model.applyInput("note", 4, 4);
    model.setSelection(0, 4);
    model.toggleMark("codeBlock");
    expect(model.serialize().formattedBody).toBe("<pre><code>note</code></pre>");
    model.toggleMark("codeBlock");
    expect(model.serialize().formattedBody).toBeNull();
  });

  it("keeps inline marks inside a block", () => {
    const model = new ComposerModel();
    model.applyInput("bold text", 9, 9);
    model.setSelection(0, 4);
    model.toggleMark("bold");
    model.setSelection(0, 9);
    model.toggleMark("heading");
    expect(model.serialize().formattedBody).toBe("<h3><strong>bold</strong> text</h3>");
  });
});
