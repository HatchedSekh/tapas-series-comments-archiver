const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchAllRootComments } = require("../lib");

// Minimal HTML that satisfies parseCommentBlocks' regexes -- not a real
// fixture, just enough shape to drive the pagination loop in isolation.
const commentRow = (id, body) => `
  <div id="comment-row-${id}">
    <div class="body__writer"><a class="writer__name" href="/user${id}">User ${id}</a><p class="writer__date">Jan 01, 2020</p></div>
    <div class="body__comment js-comment-body">${body}</div>
    <a data-cnt="1"></a>
  </div>`;

const jsonResponse = (body) => ({
  status: 200,
  statusText: "OK",
  ok: true,
  json: async () => body,
});

test("chains pages via pagination.since until has_next is false, deduping overlaps", async () => {
  let call = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    call++;
    if (call === 1) {
      return jsonResponse({
        data: {
          html: commentRow(1, "first") + commentRow(2, "second"),
          pagination: { has_next: true, since: 1000, page: 2 },
        },
      });
    }
    // page 2 repeats comment 1 (server-side overlap) and adds a new one
    return jsonResponse({
      data: {
        html: commentRow(1, "first") + commentRow(3, "third"),
        pagination: { has_next: false, since: 500, page: 3 },
      },
    });
  };

  try {
    const comments = await fetchAllRootComments(63197);
    assert.equal(call, 2, "should stop once has_next is false");
    assert.equal(comments.length, 3, "duplicate id 1 across pages should be deduped");
    assert.deepEqual(comments.map((c) => c.id).sort(), ["1", "2", "3"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("stops instead of looping forever if the since cursor stalls", async () => {
  let call = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    call++;
    // Same since/page every time, has_next always true -- a real API
    // wouldn't do this, but the loop needs to survive it if it did.
    return jsonResponse({
      data: {
        html: commentRow(99, "stuck"),
        pagination: { has_next: true, since: 777, page: 1 },
      },
    });
  };

  try {
    const comments = await fetchAllRootComments(63197);
    assert.equal(call, 2, "should break on the second identical cursor, not loop forever");
    assert.equal(comments.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("stops immediately if a page returns no comments", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    jsonResponse({ data: { html: "", pagination: { has_next: true, since: 1, page: 1 } } });

  try {
    const comments = await fetchAllRootComments(63197);
    assert.deepEqual(comments, []);
  } finally {
    global.fetch = originalFetch;
  }
});
