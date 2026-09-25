const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeHtmlEntities } = require("../lib");

test("decodes common named entities", () => {
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeHtmlEntities("&lt;div&gt;"), "<div>");
  assert.equal(decodeHtmlEntities("&quot;quoted&quot;"), '"quoted"');
});

test("decodes numeric entities, decimal and hex", () => {
  assert.equal(decodeHtmlEntities("Don&#39;t"), "Don't");
  assert.equal(decodeHtmlEntities("&#x27;single&#x27;"), "'single'");
});

test("leaves unknown entities untouched instead of throwing", () => {
  assert.equal(decodeHtmlEntities("a &madeupentity; b"), "a &madeupentity; b");
});

test("trims surrounding whitespace", () => {
  assert.equal(decodeHtmlEntities("  hello  "), "hello");
});

test("passes plain text through unchanged", () => {
  assert.equal(decodeHtmlEntities("just a normal comment"), "just a normal comment");
});
