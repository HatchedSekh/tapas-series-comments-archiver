const fs = require("fs");
const path = require("path");
const http = require("http");
const { exec } = require("child_process");

let sea;
try {
  sea = require("node:sea");
} catch {
  sea = null;
}

/*
 * The packaged .exe embeds these via sea-config.json's "assets" map (so the
 * release stays a single file); running from source (no SEA) reads the real
 * files straight off disk next to this module instead. Either way, the
 * frontend lives as normal syntax-highlightable .html/.css/.js files.
 */
const loadAsset = (seaKey, relPath) =>
  sea && sea.isSea() ? sea.getAsset(seaKey, "utf8") : fs.readFileSync(path.join(__dirname, relPath), "utf8");

const INDEX_HTML = loadAsset("viewer-index-html", "viewer/index.html");
const STYLE_CSS = loadAsset("viewer-style-css", "viewer/style.css");
const CLIENT_JS = loadAsset("viewer-client-js", "viewer/client.js");

/*
 * "Has data worth viewing" = at least one series folder containing at least
 * one episode file, not just an empty (or absent) output/ directory.
 */
const hasExistingOutput = (outDir) => {
  if (!fs.existsSync(outDir)) return false;
  const entries = fs.readdirSync(outDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  return entries.some((e) => fs.readdirSync(path.join(outDir, e.name)).some((f) => f.endsWith(".json")));
};

/* Dirnames are `${seriesId}_${sanitizeFilename(seriesName)}` from lib.js. */
/*
 * Numeric-aware so "Ep 2" sorts before "Ep 10" instead of after. Trimmed
 * because some scraped titles carry a stray leading space, which otherwise
 * fragments the sort (space vs. no-space is a strong primary-level
 * difference to most locale collations, ahead of the numeric comparison).
 */
const naturalCompare = (a, b) =>
  String(a).trim().localeCompare(String(b).trim(), undefined, { numeric: true, sensitivity: "base" });

const listSeries = (outDir) => {
  const entries = fs.readdirSync(outDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const series = entries.map((e) => {
    const sep = e.name.indexOf("_");
    const id = sep === -1 ? e.name : e.name.slice(0, sep);
    const name = sep === -1 ? e.name : e.name.slice(sep + 1);
    return { id, name, dirName: e.name };
  });
  return series.sort((a, b) => naturalCompare(a.name, b.name));
};

const listEpisodes = (outDir, seriesDir) => {
  const seriesPath = path.join(outDir, seriesDir);
  const files = fs.readdirSync(seriesPath).filter((f) => f.endsWith(".json"));
  const episodes = [];
  for (const fileName of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(seriesPath, fileName), "utf8"));
      episodes.push({
        episodeId: data.episodeId,
        episodeName: data.episodeName,
        commentCount: data.commentCount,
        fileName,
      });
    } catch (err) {
      console.warn(`  viewer: skipping unreadable episode file "${fileName}": ${err.message}`);
    }
  }
  return episodes.sort((a, b) => naturalCompare(a.episodeName || "", b.episodeName || ""));
};

const readEpisode = (outDir, seriesDir, fileName) => {
  const filePath = path.join(outDir, seriesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const openBrowser = (url) => {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.warn(`Couldn't auto-open a browser -- open ${url} manually.`);
  });
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const notFound = (res, message) => {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(message || "Not found");
};

/* Only ever accept path segments that match a real, current directory entry. */
const resolveSeriesDir = (outDir, rawSeriesDir) => {
  const decoded = decodeURIComponent(rawSeriesDir);
  const dirs = listSeries(outDir).map((s) => s.dirName);
  return dirs.includes(decoded) ? decoded : null;
};

const resolveFileName = (outDir, seriesDir, rawFileName) => {
  const decoded = decodeURIComponent(rawFileName);
  const files = fs.readdirSync(path.join(outDir, seriesDir));
  return files.includes(decoded) ? decoded : null;
};

const handleRequest = (outDir, req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method !== "GET") return notFound(res);

  if (parts.length === 0) {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(INDEX_HTML);
  }

  if (parts.length === 1 && parts[0] === "viewer.css") {
    res.writeHead(200, { "content-type": "text/css" });
    return res.end(STYLE_CSS);
  }

  if (parts.length === 1 && parts[0] === "client.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    return res.end(CLIENT_JS);
  }

  if (parts[0] === "api" && parts[1] === "series" && parts.length === 2) {
    return sendJson(res, 200, listSeries(outDir));
  }

  if (parts[0] === "api" && parts[1] === "series" && parts[3] === "episodes") {
    const seriesDir = resolveSeriesDir(outDir, parts[2]);
    if (!seriesDir) return notFound(res, "Unknown series");

    if (parts.length === 4) {
      return sendJson(res, 200, listEpisodes(outDir, seriesDir));
    }

    if (parts.length === 5) {
      const fileName = resolveFileName(outDir, seriesDir, parts[4]);
      if (!fileName) return notFound(res, "Unknown episode");
      try {
        return sendJson(res, 200, readEpisode(outDir, seriesDir, fileName));
      } catch (err) {
        return notFound(res, `Couldn't read episode: ${err.message}`);
      }
    }
  }

  return notFound(res);
};

const startViewerServer = (outDir) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => handleRequest(outDir, req, res));
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}`;
      console.log(`Viewer running at ${url} (Ctrl+C to stop)`);
      openBrowser(url);
      resolve(server);
    });
  });

module.exports = {
  hasExistingOutput,
  listSeries,
  listEpisodes,
  readEpisode,
  openBrowser,
  startViewerServer,
};
