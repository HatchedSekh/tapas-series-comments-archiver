# Tapas Series Comments Archiver

Saves a Tapas series' episode comments to your computer as JSON files, so you have a copy when the site goes away.

## How to use.

1. Grab the latest `.exe` from the [Releases page](https://github.com/HatchedSekh/tapas-series-comments-archiver/releases/latest).
2. Double-click it. You'll get a warning since this is unsigned. Accept; though if you're suspicious you can verify the code yourself in the repo.
3. It'll ask in the following order:
   - **Series name (or ID)** — go to the series' page on tapas.io and type/paste whatever comes after `/series/` in the address bar. Most of y'all can just type the series name as shown on the page, spaces and all.
   - **Fetch all episodes? (y/n)** — If you pick 'n', it'll ask a follow up question of how many episodes, you can put in a numerical value.
4. It runs until it's done, printing progress as it goes.

If it says it couldn't find that series, double check how it appears in the URL and try again.

## Where the results go

A new `output` folder appears right next to the .exe (or next to `scraper.js`, if you're running from source below). One file per episode inside it, subfolder named after the series.

## Running it from source (for Node.js users)

Prefer to run the actual code, tweak it, or contribute? You need **Node.js** installed. If you're not sure, open a terminal and type `node -v` — if you see a version number, you're set. If not, download it from [nodejs.org](https://nodejs.org) (pick the "LTS" version) and install it like any other program.

1. Open a terminal in this folder (in Windows: open the folder in File Explorer, click the address bar, type `cmd`, press Enter).

2. Go to the series' page on tapas.io and copy whatever comes after `/series/` in the address bar.
   The scraper accepts series name and its id. Most of y'all probably just will use the series name which is ideal, if there are any issues with that, you'll need to grab its ID.

3. Run:

   ```
   node scraper.js 'tapas series name' 
   e.g. node scraper.js AwesomeSeries
   ```

   (swap in whatever you copied)

   Or just run `node scraper.js` with nothing after it — it'll ask you the same questions the .exe does.

That's it. It'll print progress as it goes, one line per episode.

By default this will only grab 5 episodes; just so y'all dont run on the wrong series by mistake, or have an issue with the syntax.

- Want more? Add a number: `node scraper.js AwesomeSeries 50` (grabs the first 50 episodes)
- Want the **whole series**? `node scraper.js AwesomeSeries all`

## If it stops partway through

Just run the same command again. It skips anything it already saved, so you won't lose progress or duplicate anything — it'll pick up where it left off.

## If something looks broken

The site this pulls from is old and occasionally flaky — the scraper already retries failed requests a few times on its own. If an episode still fails after that, it'll say so and move on to the next one rather than stopping everything. Just rerun the command later to retry the ones that failed.

After it's done, you can zip it as well to save it for later.

## Okay that's great, but I don't really like the format it's at.

Plan is to create another tool to set up the desired format. Once I've sorted out a basic one I'll update this repo along with it. Main point is this is to pull it down to your computer locally so that you have this all stored as a bare minimum. Then you can run the formatter tool later.

## Extra Stuff

Just note I haven't tested this against series that are limited? or well, required extra authorization. In theory it shouldn't work, but I don't know that for certain.

Feel free to improve on what's here, if you really want? can add PRs or fork it or whatever.