import { test } from "node:test";
import assert from "node:assert/strict";
import { html, raw } from "../src/lib/html.ts";

void test("escapes interpolated text", () => {
  assert.equal(
    html`<p>${"<script> & \"quoted\" & 'apostrophe'</p>"}</p>`.value,
    `<p>&lt;script&gt; &amp; &quot;quoted&quot; &amp; &#39;apostrophe&#39;&lt;/p&gt;</p>`,
  );
});

void test("renders nothing for null, undefined and false", () => {
  assert.equal(html`<p>${null}${undefined}${false}</p>`.value, "<p></p>");
});

void test("flattens arrays and nested fragments", () => {
  const value = html`<ul>${[html`<li>${"a"}</li>`, html`<li>${"b"}</li>`]}</ul>`.value;
  assert.equal(value, "<ul><li>a</li><li>b</li></ul>");
});

void test("lets raw bypass escaping", () => {
  assert.equal(html`<div>${raw("<span>trusted</span>")}</div>`.value, "<div><span>trusted</span></div>");
});

void test("refuses a value it cannot render", () => {
  assert.throws(() => html`<p>${new Date()}</p>`, TypeError);
});
