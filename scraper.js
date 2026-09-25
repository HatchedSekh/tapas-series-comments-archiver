const fs = require("fs");
const path = require("path");
const { scrapeSeries } = require("./lib");

// Safety net: a series can be thousands of episodes, so running this with no
// limit specified should not silently kick off a massive scrape. You have to
// opt into "all episodes" on purpose (LIMIT=all), not get it by omission.
const DEFAULT_LIMIT = 5;

const main = async () => {
  // CLI args win if given; otherwise fall back to env vars, so you can either
  // run `node scraper.js 5918 4` or set SERIES_ID/LIMIT and run with no args.
  const seriesId = process.argv[2] || process.env.SERIES_ID;
  const limitRaw = process.argv[3] || process.env.LIMIT;
  if (!seriesId) {
    console.error("Usage: node scraper.js <seriesId> [limit]");
    console.error("   or: SERIES_ID=<id> LIMIT=<n> node scraper.js");
    console.error(`(no limit given defaults to ${DEFAULT_LIMIT}; pass LIMIT=all for the whole series)`);
    process.exit(1);
  }

  let limit;
  if (limitRaw === undefined) {
    limit = DEFAULT_LIMIT;
    console.warn(`No limit given -- defaulting to ${DEFAULT_LIMIT} episodes. Pass a number, or LIMIT=all, to change that.`);
  } else if (limitRaw.toLowerCase() === "all") {
    limit = undefined;
  } else {
    limit = parseInt(limitRaw, 10);
  }
  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  await scrapeSeries(seriesId, outDir, limit);
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
