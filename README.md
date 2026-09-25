# Tapas Series Data Scraper

Saves a Tapas series' episode comments to your computer as JSON files, so you have a copy when the site goes away.

## Before you start

You need **Node.js** installed. If you're not sure, open a terminal and type `node -v` — if you see a version number, you're set. If not, download it from [nodejs.org](https://nodejs.org) (pick the "LTS" version) and install it like any other program.

## Running it

1. Open a terminal in this folder (in Windows: open the folder in File Explorer, click the address bar, type `cmd`, press Enter).

2. Go to the series' page on tapas.io and copy whatever comes after `/series/` in the address bar.
   The scraper excepts series name and its id. Most of y'all probably just will use the series name which is ideal, if there are any issues with that, you'll need to grab its ID.

3. Run:

   ```
   node scraper.js 'tapas series name' 
   e.g. node scraper.js AwesomeSeries
   ```

   (swap in whatever you copied)

That's it. It'll print progress as it goes, one line per episode.

By default this will only grab 5 episodes; just so y'all dont run on the wrong series by mistake, or have an issue with the syntax.

- Want more? Add a number: `node scraper.js AwesomeSeries 50` (grabs the first 50 episodes)
- Want the **whole series**? `node scraper.js AwesomeSeries all`

## Where the results go

Inside the `output` folder, in a subfolder named after the series. One file per episode, containing the episode's title and all its comments.

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