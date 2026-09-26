const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseCommentBlocks } = require("../lib");

/*
 * Fixtures are synthetic (see test/fixtures/generate-fixtures.js) but use
 * Tapas's real markup structure/classes, captured live and then genericized
 * -- placeholder ids/usernames/text, not real people's comments, but the
 * same HTML shape parseCommentBlocks has to parse against the real site.
 */
const rootFixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/root-comments.json"), "utf8"));
const repliesFixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/replies-page1.json"), "utf8"));

test("parses root comments with correct fields", () => {
  const comments = parseCommentBlocks(rootFixture.data.html, null);

  /*
   * This fixture's total_comment_cnt is 7, but that counts roots + replies:
   * 6 root comments here, plus 1 reply nested under comment 1000002 (see the
   * "captures reply_cnt" test below) -- not a parsing bug, just the same
   * root/reply split documented in lib.js.
   */
  assert.equal(comments.length, 6);

  const first = comments[0];
  assert.equal(first.id, "1000001");
  assert.equal(first.parentId, null);
  assert.equal(first.authorHandle, "placeholder_user1");
  assert.equal(first.authorName, "Placeholder User 1");
  assert.equal(first.date, "Jan 01, 2020");
  assert.equal(first.body, "This is a sample comment for testing.");
  assert.equal(first.likeCount, 50);
  assert.equal(first.replyCount, 0);
});

test("captures reply_cnt on root comments that have replies", () => {
  const comments = parseCommentBlocks(rootFixture.data.html, null);
  const withReplies = comments.find((c) => c.id === "1000002");
  assert.ok(withReplies);
  assert.equal(withReplies.replyCount, 1);
});

test("every parsed root comment has a non-null id, author, and body", () => {
  const comments = parseCommentBlocks(rootFixture.data.html, null);
  for (const c of comments) {
    assert.ok(c.id, `comment missing id: ${JSON.stringify(c)}`);
    assert.ok(c.authorHandle, `comment ${c.id} missing authorHandle`);
    assert.ok(c.body !== null, `comment ${c.id} missing body`);
  }
});

test("parses replies and tags them with the given parentId", () => {
  const parentId = "1000002";
  const replies = parseCommentBlocks(repliesFixture.data.html, parentId);

  assert.ok(replies.length > 0);
  for (const r of replies) {
    assert.equal(r.parentId, parentId);
  }

  const first = replies[0];
  assert.equal(first.id, "2000001");
  assert.equal(first.authorHandle, "placeholder_replier1");
  assert.equal(first.authorName, "Placeholder Replier 1");
  assert.equal(first.body, "This is a sample reply for testing.");
  assert.equal(first.likeCount, 8);
});

test("returns an empty array for html with no comment rows", () => {
  assert.deepEqual(parseCommentBlocks("<div>no comments here</div>", null), []);
});
