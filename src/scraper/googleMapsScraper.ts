import { chromium } from "playwright";
import { logger } from "../utils/logger.js";
import type { RawLead } from "../types.js";

interface ScrapeOptions {
  businessTypes: string[];
  locations: string[];
  limitPerSearch: number;
}

const normalizeText = (value: string | null | undefined): string => (value ?? "").trim();

const parseRating = (text: string): number | null => {
  const match = text.match(/(\d+[.,]?\d*)/);
  if (!match) {
    return null;
  }
  return Number(match[1].replace(",", "."));
};

const parseReviewCount = (text: string): number | null => {
  const match = text.match(/(\d[\d\s]*)/);
  if (!match) {
    return null;
  }
  return Number(match[1].replace(/\s+/g, ""));
};

export const scrapeGoogleMaps = async (options: ScrapeOptions): Promise<RawLead[]> => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const collected: RawLead[] = [];

  try {
    for (const businessType of options.businessTypes) {
      for (const location of options.locations) {
        const search = `${businessType} ${location}`;
        logger.info(`Searching Google Maps for "${search}"`);
        await page.goto("https://www.google.com/maps", { waitUntil: "domcontentloaded" });
        await page.fill("#searchboxinput", search);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);

        for (let i = 0; i < options.limitPerSearch; i += 1) {
          await page.mouse.wheel(0, 1600);
          await page.waitForTimeout(600);
        }

        const leadsFromSearch = await page.$$eval('a[href*="/maps/place/"]', (anchors, meta) => {
          const uniqueLinks = Array.from(
            new Set(
              anchors
                .map((anchor) => (anchor as HTMLAnchorElement).href)
                .filter((href) => href.includes("/maps/place/"))
            )
          );

          return uniqueLinks.slice(0, meta.limitPerSearch).map((href) => ({
            placeUrl: href,
            niche: meta.businessType,
            city: meta.location
          }));
        }, { businessType, location, limitPerSearch: options.limitPerSearch });

        for (const item of leadsFromSearch) {
          await page.goto(item.placeUrl, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1400);

          const lead = await page.evaluate((meta) => {
            const readByLabel = (label: string): string => {
              const button = Array.from(document.querySelectorAll("button, a")).find((element) => {
                return element.getAttribute("aria-label")?.toLowerCase().includes(label.toLowerCase());
              });
              return (button?.textContent ?? "").trim();
            };

            const name = document.querySelector("h1")?.textContent?.trim() ?? "";
            const address = readByLabel("adresse");
            const phone = readByLabel("telephone");
            const websiteElement = Array.from(document.querySelectorAll('a[data-item-id="authority"]')).at(0);
            const website = (websiteElement as HTMLAnchorElement | undefined)?.href ?? "";
            const ratingText =
              document.querySelector('span[role="img"]')?.getAttribute("aria-label")?.trim() ?? "";
            const reviewsText = document.querySelector('button[jsaction*="pane.reviewChart.moreReviews"]')
              ?.textContent
              ?.trim() ?? "";

            return {
              name,
              address,
              phone,
              website,
              ratingText,
              reviewsText,
              niche: meta.niche,
              city: meta.city
            };
          }, { niche: item.niche, city: item.city });

          if (!lead.name) {
            continue;
          }

          collected.push({
            name: normalizeText(lead.name),
            address: normalizeText(lead.address),
            city: normalizeText(lead.city),
            phone: normalizeText(lead.phone),
            website: normalizeText(lead.website),
            rating: parseRating(lead.ratingText),
            reviews: parseReviewCount(lead.reviewsText),
            niche: normalizeText(lead.niche)
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  return collected;
};
