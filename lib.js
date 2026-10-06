const fs = require("fs");
const path = require("path");

/*
 * Two undocumented backends:
 * - api.tapas.io/v3: the mobile app's API. Good for series/episode metadata,
 *   but its /comments endpoint only returns a shallow slice of replies --
 *   root comments never show up there at all.
 * - tapas.io (the website): renders the actual full comment section, but as
 *   HTML fragments embedded in JSON rather than clean objects, hence the
 *   regex parsing below.
 */
const API_BASE = "https://api.tapas.io/v3";
const WEB_BASE = "https://tapas.io";
const API_HEADERS = {
  accept: "application/panda+json",
  /* Just need to be present with a plausible value -- neither is actually validated. */
  "x-device-type": "ANDROID",
  "x-device-uuid": "bd1f1f4004c756d3",
};
const REQUEST_DELAY_MS = 300; 
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const httpGetJson = async (url, headers = {}) => {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status >= 500) {
        // Transient here -- worth retrying.
        throw new Error(`${res.status} ${res.statusText} on ${url}`);
      }
      if (!res.ok) {
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

/*
 * tapas.io/series/{x} accepts either the numeric series ID or the URL slug --
 * both resolve to the same record. Needs an explicit Accept header, or it
 * serves the HTML page instead. Skip the network call if already numeric.
 */
const resolveSeriesId = async (input) => {
  if (/^\d+$/.test(String(input))) return String(input);
  await sleep(REQUEST_DELAY_MS);
  try {
    const res = await httpGetJson(`${WEB_BASE}/series/${input}`, { accept: "application/json" });
    return String(res.data.id);
  } catch (err) {
    /* Tapas slugs never contain spaces (e.g. "No Future" -> "NoFuture"), so a
     * typed-out title is a common miss. Retry once with spaces removed before
     * giving up. */
    const stripped = String(input).replace(/\s+/g, "");
    if (!String(err.message).includes("404") || stripped === String(input)) throw err;
    await sleep(REQUEST_DELAY_MS);
    const res = await httpGetJson(`${WEB_BASE}/series/${stripped}`, { accept: "application/json" });
    return String(res.data.id);
  }
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

/*
 * Splits on the shared id="comment-row-{id}" wrapper (roots and replies both
 * use it). Brittle by nature -- matches Tapas's current markup, not a schema.
 */
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

/*
 * since is a server-issued timestamp -- always feed back the previous
 * response's value, never invent one.
 *
 * Shared by fetchAllRootComments and fetchAllReplies below: same
 * since/page/has_next cursor shape and stall/guard safety on both of
 * Tapas's comment endpoints, just a different URL and parentId per page.
 */
const fetchAllPaginated = async (urlForPage, parentId) => {
  const items = [];
  const seenIds = new Set();
  let since = 0;
  let page = 1;
  let hasNext = true;
  let guard = 0; /* hard stop in case has_next lies and the cursor loops forever */

  while (hasNext && guard < 500) {
    guard++;
    await sleep(REQUEST_DELAY_MS);
    const res = await httpGetJson(urlForPage(page, since));
    const batch = parseCommentBlocks(res.data.html, parentId);
    if (batch.length === 0) break;

    for (const c of batch) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        items.push(c);
      }
    }

    hasNext = res.data.pagination.has_next;
    const nextSince = res.data.pagination.since;
    if (nextSince === since && res.data.pagination.page === page) break; /* stalled cursor safety */
    since = nextSince;
    page = res.data.pagination.page;
  }

  return items;
};

const fetchAllRootComments = (episodeId) =>
  fetchAllPaginated(
    (page, since) => `${WEB_BASE}/comment/${episodeId}?page=${page}&sort=TOP_COMMENT&since=${since}&init_load=0&wr=true&ep=false`,
    null
  );

const fetchAllReplies = (episodeId, rootId) =>
  fetchAllPaginated((page, since) => `${WEB_BASE}/comment/${episodeId}/${rootId}/replies?page=${page}&since=${since}`, rootId);

/*
 * Replies are a separate request per thread, so only fetch them when a root
 * actually has replies.
 */
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

/*
 * Calls go through `module.exports.fn()` so tests can stub individual pieces.
 * Plain `exports.fn()` won't work -- reassigning module.exports below breaks
 * that alias.
 */
const scrapeSeries = async (seriesIdOrSlug, outDir, episodeLimit) => {
  const seriesId = await module.exports.resolveSeriesId(seriesIdOrSlug);
  if (seriesId !== String(seriesIdOrSlug)) {
    console.log(`Resolved "${seriesIdOrSlug}" to series ID ${seriesId}.`);
  }

  console.log(`Fetching series ${seriesId}...`);
  const series = await module.exports.getSeries(seriesId);
  const seriesName = series.title;
  console.log(`Series: "${seriesName}" (${series.episode_cnt} episodes)`);

  let episodes = await module.exports.getEpisodes(seriesId);
  if (episodeLimit) episodes = episodes.slice(0, episodeLimit);
  const seriesDir = path.join(outDir, `${seriesId}_${sanitizeFilename(seriesName)}`);
  fs.mkdirSync(seriesDir, { recursive: true });

  for (const [i, ep] of episodes.entries()) {
    const episodeId = ep.id;
    const episodeName = ep.title || null;
    const filePath = path.join(seriesDir, `${episodeId}_${sanitizeFilename(episodeName || "untitled")}.json`);

    /* Resumable: skip episodes already saved, so an interrupted run can just restart. */
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
