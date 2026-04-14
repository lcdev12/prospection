import minimist from "minimist";
import { loadConfig } from "../config/loadConfig.js";
import { exportLeads } from "../export/fileExporter.js";
import { dedupeLeads } from "../filters/dedupe.js";
import { enrichLeads } from "../generator/contentGenerator.js";
import type { EnrichedLead, RawLead } from "../types.js";
import { scrapeGoogleMaps } from "../scraper/googleMapsScraper.js";
import { logger } from "../utils/logger.js";

interface CliArgs {
  types?: string;
  locations?: string;
  limit?: string;
  config?: string;
  // --no-website sets website: false (minimist behaviour for --no-<flag>)
  website?: boolean;
  // explicit alias --high-only also works
  "high-only"?: boolean;
}

const parseListArg = (rawValue: string | undefined, fallback: string[]): string[] => {
  if (!rawValue) return fallback;
  return rawValue.split(",").map((item) => item.trim()).filter(Boolean);
};

const main = async (): Promise<void> => {
  const args = minimist(process.argv.slice(2)) as CliArgs;
  const config = await loadConfig(args.config);

  const businessTypes = parseListArg(args.types, config.niches);
  const locations     = parseListArg(args.locations, config.cities);
  const limit         = Number(args.limit ?? config.defaultLimitPerSearch);
  // minimist turns --no-website into { website: false }
  const noWebsiteOnly = args.website === false || args["high-only"] === true;

  logger.info(`Business types : ${businessTypes.join(", ")}`);
  logger.info(`Locations      : ${locations.join(", ")}`);
  logger.info(`Limit/search   : ${limit}`);
  logger.info(`No-website only: ${noWebsiteOnly}`);

  const scraped = await scrapeGoogleMaps({ businessTypes, locations, limitPerSearch: limit });
  logger.info(`Scraped ${scraped.length} raw leads`);

  const deduped = dedupeLeads(scraped);
  logger.info(`After dedup: ${deduped.length} leads`);

  // Filter: keep only leads without a website if --no-website flag is set
  const filtered: RawLead[] = noWebsiteOnly
    ? deduped.filter((lead) => !lead.website)
    : deduped;

  if (noWebsiteOnly) {
    logger.info(`After no-website filter: ${filtered.length} leads`);
  }

  const enriched: EnrichedLead[] = enrichLeads(filtered);

  // Stats summary
  const high   = enriched.filter((l) => l.priority === "high").length;
  const medium = enriched.filter((l) => l.priority === "medium").length;
  const low    = enriched.filter((l) => l.priority === "low").length;
  logger.info(`Priority breakdown → high: ${high} | medium: ${medium} | low: ${low}`);

  const { jsonPath, csvPath } = await exportLeads(enriched);
  logger.info(`JSON → ${jsonPath}`);
  logger.info(`CSV  → ${csvPath}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Pipeline failed: ${message}`);
  process.exitCode = 1;
});
