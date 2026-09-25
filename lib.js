const fs = require("fs");
const path = require("path");

// Two unrelated backends, both undocumented:
// - api.tapas.io/v3 is the mobile app's API. Good for series/episode metadata.
//   Its own /comments endpoint looked pageable but only ever returns a shallow
//   "recent replies" slice (verified: 72/100 comments on a test episode, and
//   every single one was a reply -- root comments never appeared at all).
// - tapas.io (the website itself) is what actually renders the full comment
//   section, confirmed 100/100 against total_comment_cnt with no duplicates.
//   It returns HTML fragments embedded in JSON, not clean comment objects,
//   hence the regex parsing below instead of json.field access.
const API_BASE = "https://api.tapas.io/v3";
const WEB_BASE = "https://tapas.io";
const API_HEADERS = {
  accept: "application/panda+json",
  // These two headers just need to be present with a plausible value -- the
  // server doesn't validate x-device-uuid's format despite what it claims,
  // and x-device-type only needs to be a known platform string.
  "x-device-type": "ANDROID",
  "x-device-uuid": "bd1f1f4004c756d3",
};
const REQUEST_DELAY_MS = 300; // keep this polite -- the site's already flaky/going away
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const httpGetJson = async (url, headers = {}) => {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status >= 500) {
        // 500s are common and transient here (hit one mid-development on this
        // exact API, then a retry of the identical URL succeeded) -- retry.
        throw new Error(`${res.status} ${res.statusText} on ${url}`);
      }
      if (!res.ok) {
        // 4xx means the request itself is wrong; retrying won't fix that.
        throw Object.assign(new Error(`${res.status} ${res.statusText} on ${url}`), { fatal: true });
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err.fatal || attempt === MAX_RETRIES) break;
      const backoff = REQUEST_DELAY_MS * 2 ** attempt;
      console.warn(`    retry ${attempt + 1}/${MAX_RETRIES} after error: ${err.message} (waiting ${backoff}ms)`);
      await sleep(backoff);
    }
  }
  throw lastErr;
};

const apiGet = async (endpoint, params = {}) => {
  const url = new URL(API_BASE + endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return httpGetJson(url, API_HEADERS);
};

const getSeries = async (seriesId) => {
  await sleep(REQUEST_DELAY_MS);
  return apiGet(`/series/${seriesId}`);
};

const getEpisodes = async (seriesId) => {
  await sleep(REQUEST_DELAY_MS);
  return apiGet(`/series/${seriesId}/episodes`);
};

// tapas.io/series/{x} accepts EITHER the numeric series ID or the URL slug
// (e.g. both /series/5918 and /series/NoFuture resolve to the same record) --
// verified live, both return {"data":{"id":5918,"title":"No Future",...}}.
// It only returns JSON with an explicit Accept header; without one it serves
// the full HTML page instead. If the input is already numeric, skip the
// network call entirely -- no need to resolve what's already resolved.
const resolveSeriesId = async (input) => {
  if (/^\d+$/.test(String(input))) return String(input);
  await sleep(REQUEST_DELAY_MS);
  const res = await httpGetJson(`${WEB_BASE}/series/${input}`, { accept: "application/json" });
  return String(res.data.id);
};

const HTML_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ",
};

const decodeHtmlEntities = (str) =>
  str
    .replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ent) => {
      if (ent[0] === "#") {
        const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return HTML_ENTITIES[ent] ?? match;
    })
    .trim();

const stripTags = (html) => html.replace(/<[^>]*>/g, "");

// Parses the HTML fragment returned by the comment/replies endpoints into
// structured records. Both root comments and replies share the same
// id="comment-row-{id}" wrapper, so we split on that boundary.
// This is brittle by nature -- it's matching Tapas's current template
// markup, not a schema. If they redesign the comment section, this breaks.
const parseCommentBlocks = (html, parentId) => {
  const blockStarts = [...html.matchAll(/id="comment-row-(\d+)"/g)];
  const comments = [];

  for (let i = 0; i < blockStarts.length; i++) {
    const id = blockStarts[i][1];
    const start = blockStarts[i].index;
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1].index : html.length;
    const block = html.slice(start, end);

    const authorMatch = block.match(/class="writer__name" href="\/([^"]+)">([^<]*)</);
    const dateMatch = block.match(/class="writer__date">([^<]*)</);
    const bodyMatch = block.match(/class="body__comment js-comment-body">([\s\S]*?)<\/div>/);
    const likeMatch = block.match(/data-cnt="(\d+)"/);
    const replyCntMatch = block.match(/data-reply-cnt="(\d+)"/);

    comments.push({
      id,
      parentId: parentId ?? null,
      authorHandle: authorMatch ? authorMatch[1] : null,
      authorName: authorMatch ? decodeHtmlEntities(authorMatch[2]) : null,
      date: dateMatch ? dateMatch[1].trim() : null,
      body: bodyMatch ? decodeHtmlEntities(stripTags(bodyMatch[1])) : null,
      likeCount: likeMatch ? parseInt(likeMatch[1], 10) : 0,
      replyCount: replyCntMatch ? parseInt(replyCntMatch[1], 10) : 0,
    });
  }

  return comments;
};

// since here is a server-issued millisecond timestamp, not something we
// compute -- each response's pagination.since must be fed into the next
// request verbatim. Passing an arbitrary/invented value returns nothing.
const fetchAllRootComments = async (episodeId) => {
  const comments = [];
  const seenIds = new Set();
  let since = 0;
  let page = 1;
  let hasNext = true;
  let guard = 0; // hard stop in case has_next lies and the cursor loops forever

  while (hasNext && guard < 500) {
    guard++;
    await sleep(REQUEST_DELAY_MS);
    const url = `${WEB_BASE}/comment/${episodeId}?page=${page}&sort=TOP_COMMENT&since=${since}&init_load=0&wr=true&ep=false`;
    const res = await httpGetJson(url);
    const batch = parseCommentBlocks(res.data.html, null);
    if (batch.length === 0) break;

    for (const c of batch) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        comments.push(c);
      }
    }

    hasNext = res.data.pagination.has_next;
    const nextSince = res.data.pagination.since;
    if (nextSince === since && res.data.pagination.page === page) break; // stalled cursor safety
    since = nextSince;
    page = res.data.pagination.page;
  }

  return comments;
};

const fetchAllReplies = async (episodeId, rootId) => {
  const replies = [];
  const seenIds = new Set();
  let since = 0;
  let page = 1;
  let hasNext = true;
  let guard = 0;

  while (hasNext && guard < 500) {
    guard++;
    await sleep(REQUEST_DELAY_MS);
    const url = `${WEB_BASE}/comment/${episodeId}/${rootId}/replies?page=${page}&since=${since}`;
    const res = await httpGetJson(url);
    const batch = parseCommentBlocks(res.data.html, rootId);
    if (batch.length === 0) break;

    for (const c of batch) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        replies.push(c);
      }
    }

    hasNext = res.data.pagination.has_next;
    const nextSince = res.data.pagination.since;
    if (nextSince === since && res.data.pagination.page === page) break;
    since = nextSince;
    page = res.data.pagination.page;
  }

  return replies;
};

// Replies are a separate request per thread (that's how the site itself
// lazy-loads them), so we only pay for it when a root actually has replies
// -- fetching replies for every root regardless would roughly double the
// request count on threads that never got any.
const getAllComments = async (episodeId) => {
  const roots = await fetchAllRootComments(episodeId);
  const all = [...roots];

  for (const root of roots) {
    if (root.replyCount > 0) {
      const replies = await fetchAllReplies(episodeId, root.id);
      all.push(...replies);
    }
  }

  return all;
};

const sanitizeFilename = (name) => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();

// Internal calls go through `module.exports.fn(...)` rather than the local
// const directly, so tests can monkey-patch individual pieces (e.g. stub
// getAllComments) without mocking the whole network stack. Note: plain
// `exports.fn(...)` would NOT work here -- reassigning `module.exports = {}`
// below breaks the `exports` alias, leaving it pointing at Node's original
// (empty) default object.
const scrapeSeries = async (seriesIdOrSlug, outDir, limit) => {
  const seriesId = await module.exports.resolveSeriesId(seriesIdOrSlug);
  if (seriesId !== String(seriesIdOrSlug)) {
    console.log(`Resolved "${seriesIdOrSlug}" to series ID ${seriesId}.`);
  }

  console.log(`Fetching series ${seriesId}...`);
  const series = await module.exports.getSeries(seriesId);
  const seriesName = series.title;
  console.log(`Series: "${seriesName}" (${series.episode_cnt} episodes)`);

  let episodes = await module.exports.getEpisodes(seriesId);
  if (limit) episodes = episodes.slice(0, limit);
  const seriesDir = path.join(outDir, `${seriesId}_${sanitizeFilename(seriesName)}`);
  fs.mkdirSync(seriesDir, { recursive: true });

  for (const [i, ep] of episodes.entries()) {
    const episodeId = ep.id;
    const episodeName = ep.title || null;
    const filePath = path.join(seriesDir, `${episodeId}_${sanitizeFilename(episodeName || "untitled")}.json`);

    // Resumable by design: a full series can be thousands of episodes and
    // the site is reportedly going down, so a run that dies partway through
    // (or an outage mid-scrape) should be safe to just restart later.
    if (fs.existsSync(filePath)) {
      console.log(`  [${i + 1}/${episodes.length}] Episode ${episodeId} already scraped, skipping.`);
      continue;
    }

    console.log(`  [${i + 1}/${episodes.length}] Episode ${episodeId} - "${episodeName}"...`);

    let comments;
    try {
      comments = await module.exports.getAllComments(episodeId);
    } catch (err) {
      console.error(`    FAILED, skipping (rerun the script later to retry): ${err.message}`);
      continue;
    }

    const output = {
      seriesId,
      seriesName,
      episodeId,
      episodeName,
      scrapedAt: new Date().toISOString(),
      commentCount: comments.length,
      comments,
    };

    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), "utf8");
    console.log(`    -> ${comments.length} comments saved to ${filePath}`);
  }

  console.log(`Done. Output in ${seriesDir}`);
};

module.exports = {
  API_BASE,
  WEB_BASE,
  sleep,
  httpGetJson,
  apiGet,
  getSeries,
  getEpisodes,
  resolveSeriesId,
  decodeHtmlEntities,
  stripTags,
  parseCommentBlocks,
  fetchAllRootComments,
  fetchAllReplies,
  getAllComments,
  sanitizeFilename,
  scrapeSeries,
};
