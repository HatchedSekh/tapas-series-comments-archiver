const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveSeriesId } = require("../lib");

const jsonResponse = (body) => ({ status: 200, statusText: "OK", ok: true, json: async () => body });

test("passes a purely numeric id through without any network call", async () => {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls++;
    throw new Error("should not be called for a numeric id");
  };

  try {
    const result = await resolveSeriesId("5918");
    assert.equal(result, "5918");
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("resolves a URL slug to its numeric id via tapas.io/series/{slug}", async () => {
  let requestedUrl;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return jsonResponse({ data: { id: 5918, title: "No Future" } });
  };

  try {
    const result = await resolveSeriesId("NoFuture");
    assert.equal(result, "5918");
    assert.match(requestedUrl, /\/series\/NoFuture$/);
  } finally {
    global.fetch = originalFetch;
  }
});

const notFoundResponse = { status: 404, statusText: "Not Found", ok: false, json: async () => ({}) };

test("retries with spaces stripped when the typed-out name 404s", async () => {
  const requestedUrls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    return String(url).endsWith("/series/No Future") ? notFoundResponse : jsonResponse({ data: { id: 5918 } });
  };

  try {
    const result = await resolveSeriesId("No Future");
    assert.equal(result, "5918");
    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls[0].endsWith("/series/No Future"));
    assert.ok(requestedUrls[1].endsWith("/series/NoFuture"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("does not bother retrying when there are no spaces to strip", async () => {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls++;
    return notFoundResponse;
  };

  try {
    await assert.rejects(() => resolveSeriesId("DefinitelyNotReal"));
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
