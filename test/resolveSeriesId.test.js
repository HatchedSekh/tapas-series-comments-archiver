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
