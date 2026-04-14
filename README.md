# Prospection Automation (Node.js + TypeScript)

MVP tool for local business prospecting in Ile-de-France:

- Scrapes Google Maps businesses by niche and city
- Scores priority (`high` / `medium` / `low`)
- Generates personalized cold emails and call notes
- Exports JSON and CSV files (Excel-compatible)

## Requirements

- Node.js LTS
- npm
- Playwright browser binaries

Install Playwright browsers once:

```bash
npx playwright install chromium
```

## Setup

```bash
npm install
```

## Run

Default run with values from `config/prospecting.config.json`:

```bash
npm run scrape
```

Custom run:

```bash
npm run scrape -- --types="auto ecole,plombier" --locations="Melun,Evry" --limit=5
```

## Output

Generated in `output/`:

- `leads-<timestamp>.json`
- `leads-<timestamp>.csv`

## Project structure

- `src/scraper` Google Maps scraper
- `src/filters` scoring + dedupe
- `src/generator` enrichment text generation
- `src/export` JSON and CSV exporters
- `src/cli` command entrypoint
