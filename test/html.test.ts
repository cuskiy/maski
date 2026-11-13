import { describe, expect, it } from "vitest";
import { attrs, html, raw } from "../src/lib/html.ts";

describe("html", () => {
  it("escapes a value", () => {
    expect(html`<p>${'<script>&"'}</p>`.value).toBe("<p>&lt;script&gt;&amp;&quot;</p>");
  });

  it("renders nothing for null, undefined and false", () => {
    expect(html`<p>${null}${undefined}${false}</p>`.value).toBe("<p></p>");
  });

  it("flattens arrays and nested markup", () => {
    expect(html`<ul>${[html`<li>a</li>`, html`<li>b</li>`]}</ul>`.value).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("lets raw bypass escaping", () => {
    expect(html`<p>${raw("<b>bold</b>")}</p>`.value).toBe("<p><b>bold</b></p>");
  });

  it("refuses a value it cannot render", () => {
    expect(() => html`<p>${() => undefined}</p>`).toThrow(TypeError);
  });
});

describe("attrs", () => {
  it("writes a true flag, skips a false one and quotes the rest", () => {
    expect(attrs({ hidden: true, disabled: false, title: 'a "b"' }).value).toBe(' hidden title="a &quot;b&quot;"');
  });
});
