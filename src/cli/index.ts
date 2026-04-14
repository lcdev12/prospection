import minimist from "minimist";
import { loadConfig } from "../config/loadConfig.js";
import { exportLeads } from "../export/fileExporter.js";
import { dedupeLeads } from "../filters/dedupe.js";
import { enrichLeads } from "../generator/contentGenerator.js";
import { scrapeGoogleMaps } from "../scraper/googleMapsScraper.js";
import { logger } from "../utils/logger.js";

interface CliArgs {
  types?: string;
  locations?: string;
  limit?: string;
  config?: string;
}

const parseListArg = (rawValue: string | undefined, fallback: string[]): string[] => {
  if (!rawValue) {
    return fallback;
  }
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const main = async (): Promise<void> => {
  const args = minimist(process.argv.slice(2)) as CliArgs;
  const config = await loadConfig(args.config);

  const businessTypes = parseListArg(args.types, config.niches);
  const locations = parseListArg(args.locations, config.cities);
  const limit = Number(args.limit ?? config.defaultLimitPerSearch);

  logger.info(`Business types: ${businessTypes.join(", ")}`);
  logger.info(`Locations: ${locations.join(", ")}`);
  logger.info(`Limit per search: ${limit}`);

  const scraped = await scrapeGoogleMaps({
    businessTypes,
    locations,
    limitPerSearch: limit
  });

  logger.info(`Scraped ${scraped.length} raw leads`);
  const deduped = dedupeLeads(scraped);
  logger.info(`After deduplication: ${deduped.length} leads`);

  const enriched = enrichLeads(deduped);
  const { jsonPath, csvPath } = await exportLeads(enriched);

  logger.info(`JSON exported: ${jsonPath}`);
  logger.info(`CSV exported: ${csvPath}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Scrape pipeline failed: ${message}`);
  process.exitCode = 1;
});
