const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { scrapeSeries } = require("./lib");
const { hasExistingOutput, startViewerServer } = require("./viewer");

/*
 * Safety net so a bare run can't silently kick off a massive scrape.
 */
const DEFAULT_LIMIT = 5;

/*
 * No args/env vars at all (e.g. double-clicking the exe). Ask interactively
 * instead of printing a usage error into a console window that instantly closes.
 */
const runInteractive = async (outDir) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  try {
    let seriesInput = "";
    while (!seriesInput) {
      seriesInput = (await ask("Series name (or ID): ")).trim();
    }

    let fetchAll = false;
    let episodeLimit = 0;
    const fetchAllAnswer = (await ask("Fetch all episodes? (y/n): ")).trim().toLowerCase();
    if (fetchAllAnswer.startsWith("y")) {
      fetchAll = true;
    } else {
      while (true) {
        const raw = (await ask("How many episodes? ")).trim();
        const parsed = parseInt(raw, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          episodeLimit = parsed;
          break;
        }
          console.log("Please enter a whole number greater than 0.")
      }
    }

    /* Only retry on "series not found", other errors bubble up and end the program. */
    let succeeded = false;
    while (!succeeded) {
      try {
        await scrapeSeries(seriesInput, outDir, episodeLimit);
        succeeded = true;
      } catch (err) {
        if (!String(err.message).includes("404")) throw err;

        console.log(`\nCouldn't find a series called "${seriesInput}".`);
        console.log(
          'Double check how it appears in the URL: open the series page on tapas.io and copy exactly what comes after "/series/" in the address bar.\n'
        );
        seriesInput = "";
        while (!seriesInput) {
          seriesInput = (await ask("Series name (or ID): ")).trim();
        }
      }
    }
  } finally {
    rl.close();
  }
};

const main = async () => {
  /* CLI args win over env vars; neither given falls back to interactive prompts. */
  const seriesId = process.argv[2] || process.env.SERIES_ID;
  const limitRaw = process.argv[3] || process.env.LIMIT;
  const outDir = path.join(__dirname, "output");

  if (!seriesId && hasExistingOutput(outDir)) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (
      await new Promise((resolve) =>
        rl.question('Existing scraped data found in "output". View it in a browser? (y/n): ', resolve)
      )
    )
      .trim()
      .toLowerCase();
    rl.close();

    if (answer.startsWith("y")) {
      await startViewerServer(outDir);
      return; // the server keeps the process alive; Ctrl+C exits
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  if (!seriesId) {
    await runInteractive(outDir);
    return;
  }

  let episodeLimit;
  if (limitRaw === undefined) {
    episodeLimit = DEFAULT_LIMIT;
    console.warn(`No limit given -- defaulting to ${DEFAULT_LIMIT} episodes. Pass a number, or LIMIT=all, to change that.`);
  } else if (limitRaw.toLowerCase() === "all") {
    episodeLimit = undefined;
  } else {
    episodeLimit = parseInt(limitRaw, 10);
  }

  await scrapeSeries(seriesId, outDir, episodeLimit);
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
