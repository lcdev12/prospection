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
  // --no-website  → minimist sets website: false
  website?: boolean;
  // --high-only   → explicit alias
  "high-only"?: boolean;
  // --email-only  → only leads where an email was found (regardless of website)
  "email-only"?: boolean;
  // --email-no-website → email found AND no website (best leads)
  "email-no-website"?: boolean;
}

const parseListArg = (rawValue: string | undefined, fallback: string[]): string[]  => {
  if (!rawValue) return fallback;
  return rawValue.split(",").map((item) => item.trim()).filter(Boolean);
};

const applyFilters = (leads: RawLead[], args: CliArgs): RawLead[] => {
  const noWebsiteOnly  = args.website === false || args["high-only"] === true;
  const emailOnly      = args["email-only"] === true;
  const emailNoWebsite = args["email-no-website"] === true;

  let result = leads;

  if (emailNoWebsite) {
    result = result.filter((l) => l.email && !l.website);
    logger.info(`Filter [email + no website]: ${result.length} leads`);
  } else if (emailOnly) {
    result = result.filter((l) => Boolean(l.email));
    logger.info(`Filter [email only]: ${result.length} leads`);
  } else if (noWebsiteOnly) {
    result = result.filter((l) => !l.website);
    logger.info(`Filter [no website]: ${result.length} leads`);
  }

  return result;
};

const main = async (): Promise<void> => {
  const args = minimist(process.argv.slice(2)) as CliArgs;
  const config = await loadConfig(args.config);

  const businessTypes = parseListArg(args.types, config.niches);
  const locations     = parseListArg(args.locations, config.cities);
  const limit         = Number(args.limit ?? config.defaultLimitPerSearch);

  const noWebsiteOnly  = args.website === false || args["high-only"] === true;
  const emailOnly      = args["email-only"] === true;
  const emailNoWebsite = args["email-no-website"] === true;

  logger.info(`Business types    : ${businessTypes.join(", ")}`);
  logger.info(`Locations         : ${locations.join(", ")}`);
  logger.info(`Limit/search      : ${limit}`);
  logger.info(`Mode              : ${emailNoWebsite ? "email + no website" : emailOnly ? "email only" : noWebsiteOnly ? "no website" : "all"}`);

  const scraped = await scrapeGoogleMaps({ businessTypes, locations, limitPerSearch: limit });
  logger.info(`Scraped ${scraped.length} raw leads`);

  const deduped = dedupeLeads(scraped);
  logger.info(`After dedup: ${deduped.length} leads`);

  const filtered = applyFilters(deduped, args);

  const enriched: EnrichedLead[] = enrichLeads(filtered);

  if (enriched.length === 0) {
    logger.warn("No leads match the current filters. Try removing filters or adding more cities/niches.");
    return;
  }

  const high   = enriched.filter((l) => l.priority === "high").length;
  const medium = enriched.filter((l) => l.priority === "medium").length;
  const low    = enriched.filter((l) => l.priority === "low").length;
  const withEmail = enriched.filter((l) => l.email).length;
  logger.info(`Priority: high=${high} | medium=${medium} | low=${low} | with email=${withEmail}`);

  const { jsonPath, csvPath } = await exportLeads(enriched);
  logger.info(`JSON → ${jsonPath}`);
  logger.info(`CSV  → ${csvPath}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Pipeline failed: ${message}`);
  process.exitCode = 1;
});
