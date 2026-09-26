const test = require("node:test");
const assert = require("node:assert/strict");
const { httpGetJson } = require("../lib");

const fakeResponse = (status, body) => ({
  status,
  statusText: `status ${status}`,
  ok: status < 400,
  json: async () => body,
});

test("retries on 5xx and eventually succeeds", async () => {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls++;
    if (calls < 3) return fakeResponse(500, null);
    return fakeResponse(200, { ok: true, calls });
  };

  try {
    const result = await httpGetJson("https://example.test/x");
    assert.equal(result.ok, true);
    assert.equal(calls, 3); /* failed twice, succeeded on the 3rd */
  } finally {
    global.fetch = originalFetch;
  }
});

test("does not retry on 4xx -- fails on the first attempt", async () => {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls++;
    return fakeResponse(404, null);
  };

  try {
    await assert.rejects(() => httpGetJson("https://example.test/missing"));
    assert.equal(calls, 1, "should not retry a 4xx");
  } finally {
    global.fetch = originalFetch;
  }
});
