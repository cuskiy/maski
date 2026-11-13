import { test } from "node:test";
import assert from "node:assert/strict";
import { attrs, html, raw } from "../src/lib/html.ts";

void test("escapes a value", () => {
  assert.equal(html`<p>${'<script>&"'}</p>`.value, "<p>&lt;script&gt;&amp;&quot;</p>");
});

void test("renders nothing for null, undefined and false", () => {
  assert.equal(html`<p>${null}${undefined}${false}</p>`.value, "<p></p>");
});

void test("flattens arrays and nested markup", () => {
  assert.equal(html`<ul>${[html`<li>a</li>`, html`<li>b</li>`]}</ul>`.value, "<ul><li>a</li><li>b</li></ul>");
});

void test("lets raw bypass escaping", () => {
  assert.equal(html`<p>${raw("<b>bold</b>")}</p>`.value, "<p><b>bold</b></p>");
});

void test("refuses a value it cannot render", () => {
  assert.throws(() => html`<p>${() => undefined}</p>`, TypeError);
});

void test("writes a true flag, skips a false one and quotes the rest", () => {
  assert.equal(attrs({ hidden: true, disabled: false, title: 'a "b"' }).value, ' hidden title="a &quot;b&quot;"');
});
