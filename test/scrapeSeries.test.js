const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("../lib");

test("skips episodes that already have an output file, and does not re-fetch their comments", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "scraper-test-"));
  const originals = {
    getSeries: lib.getSeries,
    getEpisodes: lib.getEpisodes,
    getAllComments: lib.getAllComments,
  };

  const commentFetchCalls = [];
  lib.getSeries = async () => ({ title: "Test Series", episode_cnt: 2 });
  lib.getEpisodes = async () => [
    { id: 111, title: "Ep One" },
    { id: 222, title: "Ep Two" },
  ];
  lib.getAllComments = async (episodeId) => {
    commentFetchCalls.push(episodeId);
    return [{ id: "c1", parentId: null, body: "hello", likeCount: 0, replyCount: 0 }];
  };

  try {
    const seriesDir = path.join(outDir, "5918_Test Series");
    fs.mkdirSync(seriesDir, { recursive: true });
    /* Pre-seed episode 111's output so it looks already-scraped. */
    fs.writeFileSync(
      path.join(seriesDir, "111_Ep One.json"),
      JSON.stringify({ episodeId: 111, commentCount: 3, comments: [] }),
      "utf8"
    );

    await lib.scrapeSeries("5918", outDir, undefined);

    assert.deepEqual(commentFetchCalls, [222], "should only fetch comments for the un-scraped episode");

    const newFile = path.join(seriesDir, "222_Ep Two.json");
    assert.ok(fs.existsSync(newFile), "episode 222 should have been scraped and written");

    const written = JSON.parse(fs.readFileSync(newFile, "utf8"));
    assert.equal(written.episodeId, 222);
    assert.equal(written.episodeName, "Ep Two");
    assert.equal(written.seriesName, "Test Series");
    assert.equal(written.commentCount, 1);

    /* The pre-seeded file for 111 should be untouched (still its original stub content). */
    const untouched = JSON.parse(fs.readFileSync(path.join(seriesDir, "111_Ep One.json"), "utf8"));
    assert.equal(untouched.commentCount, 3);
  } finally {
    Object.assign(lib, originals);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("a failed episode is skipped (not fatal) and does not produce an output file", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "scraper-test-"));
  const originals = {
    getSeries: lib.getSeries,
    getEpisodes: lib.getEpisodes,
    getAllComments: lib.getAllComments,
  };

  lib.getSeries = async () => ({ title: "Flaky Series", episode_cnt: 1 });
  lib.getEpisodes = async () => [{ id: 999, title: "Broken Ep" }];
  lib.getAllComments = async () => {
    throw new Error("simulated network failure");
  };

  try {
    await lib.scrapeSeries("1", outDir, undefined);
    const seriesDir = path.join(outDir, "1_Flaky Series");
    const files = fs.existsSync(seriesDir) ? fs.readdirSync(seriesDir) : [];
    assert.deepEqual(files, [], "no output file should exist for a failed episode");
  } finally {
    Object.assign(lib, originals);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
