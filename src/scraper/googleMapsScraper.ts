import { type Page, chromium } from "playwright";
import { logger } from "../utils/logger.js";
import type { RawLead } from "../types.js";

interface ScrapeOptions {
  businessTypes: string[];
  locations: string[];
  limitPerSearch: number;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

const normalizeText = (value: string | null | undefined): string =>
  (value ?? "").trim();

const parseRating = (text: string): number | null => {
  const match = text.match(/(\d+[.,]\d+)/);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
};

const parseReviewCount = (text: string): number | null => {
  // handles "1 234" or "1,234" or "1234"
  const clean = text.replace(/[\s\u00a0]/g, "").replace(",", "");
  const match = clean.match(/(\d+)/);
  if (!match) return null;
  return Number(match[1]);
};

// ─── Cookie consent handler ───────────────────────────────────────────────────

const dismissConsent = async (page: Page): Promise<void> => {
  const consentSelectors = [
    'button[aria-label*="Accept"]',
    'button[aria-label*="Accepter"]',
    'button[aria-label*="Tout accepter"]',
    'button:has-text("Accept all")',
    'button:has-text("Tout accepter")',
    'button:has-text("Accepter tout")',
    'form[action*="consent"] button',
  ];
  for (const selector of consentSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click().catch(() => undefined);
      await page.waitForTimeout(600);
      break;
    }
  }
};

// ─── Navigate to Google Maps search (URL-based, no form fill) ─────────────────

const navigateToSearch = async (page: Page, query: string): Promise<void> => {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/maps/search/${encoded}/?hl=fr`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await dismissConsent(page);
  // Wait for at least one place card to appear
  await page
    .waitForSelector('a[href*="/maps/place/"]', { timeout: 20_000 })
    .catch(() => undefined);
};

// ─── Collect place URLs from the results list ─────────────────────────────────

const collectPlaceUrls = async (
  page: Page,
  limit: number
): Promise<string[]> => {
  // Scroll the result panel to load more results
  const panelSelectors = [
    'div[role="feed"]',
    'div[aria-label*="Résultats"]',
    'div[aria-label*="Results"]',
  ];

  let panel = null;
  for (const sel of panelSelectors) {
    panel = await page.$(sel);
    if (panel) break;
  }

  const scrollSteps = Math.min(Math.ceil(limit / 5) + 1, 8);
  for (let i = 0; i < scrollSteps; i += 1) {
    if (panel) {
      await panel.evaluate((el) => el.scrollBy(0, 1600));
    } else {
      await page.mouse.wheel(0, 1600);
    }
    await page.waitForTimeout(700);
  }

  const hrefs = await page.$$eval('a[href*="/maps/place/"]', (anchors) =>
    Array.from(new Set(anchors.map((a) => (a as HTMLAnchorElement).href)))
  );

  return hrefs.slice(0, limit);
};

// ─── Extract lead data from a place detail page ───────────────────────────────

const extractLeadFromPage = async (
  page: Page,
  placeUrl: string,
  niche: string,
  city: string
): Promise<RawLead | null> => {
  try {
    await page.goto(placeUrl, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await dismissConsent(page);
    // Wait for the business name heading
    await page
      .waitForSelector("h1", { timeout: 12_000 })
      .catch(() => undefined);
    await page.waitForTimeout(600);
  } catch (navError) {
    logger.warn(`Navigation failed for ${placeUrl}: ${String(navError)}`);
    return null;
  }

  // Pass as a raw string so esbuild does NOT compile/transform this code.
  // page.evaluate(string) executes the expression directly in the browser.
  type EvalResult = {
    name: string; address: string; phone: string;
    website: string; ratingText: string; reviewsText: string;
  };
  const data = await page.evaluate(`
    (function() {
      function byAriaLabel(keywords) {
        var elements = Array.from(document.querySelectorAll("button, a, [role='button']"));
        for (var i = 0; i < keywords.length; i++) {
          var kw = keywords[i].toLowerCase();
          var el = elements.find(function(e) {
            var lbl = e.getAttribute("aria-label");
            return lbl ? lbl.toLowerCase().indexOf(kw) !== -1 : false;
          });
          if (el) return (el.textContent || el.getAttribute("aria-label") || "").trim();
        }
        return "";
      }

      function byDataItemId(id) {
        var el = document.querySelector('[data-item-id="' + id + '"]');
        if (!el) return "";
        return (el.textContent || el.href || "").trim();
      }

      var h1 = document.querySelector("h1");
      var name = h1 ? h1.textContent.trim() : "";

      var addrFallback = document.querySelector('[data-item-id="address"]');
      var address =
        byAriaLabel(["adresse", "address"]) ||
        byDataItemId("address") ||
        (addrFallback ? addrFallback.textContent.trim() : "");

      // Strategy 1: data-item-id contains the number after the last colon
      // e.g. data-item-id="phone:tel:+33164378822"
      var phoneEl = document.querySelector('[data-item-id^="phone:tel:"]');
      var phone = "";
      if (phoneEl) {
        var itemId = phoneEl.getAttribute("data-item-id") || "";
        var parts = itemId.split(":");
        phone = parts[parts.length - 1] || "";
      }
      // Strategy 2: aria-label of the phone button contains the number
      // e.g. aria-label="Appeler le 01 64 37 88 22"
      if (!phone) {
        var allEls = Array.from(document.querySelectorAll("button, a, [role='button'], [data-item-id^='phone']"));
        for (var pi = 0; pi < allEls.length; pi++) {
          var lbl2 = allEls[pi].getAttribute("aria-label") || "";
          var numMatch = lbl2.match(/(\\+?[0-9][0-9\\s\\.\\-]{7,15})/);
          if (numMatch) { phone = numMatch[1].trim(); break; }
        }
      }
      // Strategy 3: any element whose text looks like a phone number
      if (!phone) {
        var allSpans = Array.from(document.querySelectorAll("span, div"));
        for (var si = 0; si < allSpans.length; si++) {
          var t = (allSpans[si].textContent || "").trim();
          if (/^(\\+?[0-9][0-9\\s\\.\\-]{7,15})$/.test(t)) { phone = t; break; }
        }
      }

      var websiteEl = document.querySelector('a[data-item-id="authority"]');
      var website = websiteEl ? (websiteEl.href || websiteEl.textContent.trim()) : "";

      var ratingText = "";
      var ratingSpans = Array.from(document.querySelectorAll("span[aria-label]"));
      for (var rs = 0; rs < ratingSpans.length; rs++) {
        var lbl = ratingSpans[rs].getAttribute("aria-label") || "";
        if (/[0-9][,\\.][0-9]/.test(lbl)) { ratingText = lbl; break; }
      }
      if (!ratingText) {
        var spans = Array.from(document.querySelectorAll("span"));
        var rSpan = spans.find(function(s) { return /^[0-9][,.][0-9]$/.test((s.textContent || "").trim()); });
        if (rSpan) ratingText = rSpan.textContent.trim();
      }

      var reviewsText = "";
      var reviewBtn = document.querySelector('button[jsaction*="reviewChart"]');
      if (reviewBtn) reviewsText = reviewBtn.textContent.trim();
      if (!reviewsText) {
        var revEl = document.querySelector('[aria-label*="avis"]') || document.querySelector('[aria-label*="review"]');
        if (revEl) reviewsText = revEl.getAttribute("aria-label") || "";
      }

      return { name: name, address: address, phone: phone, website: website, ratingText: ratingText, reviewsText: reviewsText };
    })()
  `) as EvalResult;

  if (!data.name) return null;

  return {
    name: normalizeText(data.name),
    address: normalizeText(data.address),
    city,
    phone: normalizeText(data.phone),
    website: normalizeText(data.website),
    rating: parseRating(data.ratingText),
    reviews: parseReviewCount(data.reviewsText),
    niche,
  };
};

// ─── Main entry ───────────────────────────────────────────────────────────────

export const scrapeGoogleMaps = async (options: ScrapeOptions): Promise<RawLead[]> => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--lang=fr-FR", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    locale: "fr-FR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const collected: RawLead[] = [];

  try {
    for (const businessType of options.businessTypes) {
      for (const location of options.locations) {
        const search = `${businessType} ${location}`;
        logger.info(`Searching: "${search}"`);

        await navigateToSearch(page, search).catch((err: unknown) => {
          logger.warn(`Search navigation failed for "${search}": ${String(err)}`);
        });

        const placeUrls = await collectPlaceUrls(page, options.limitPerSearch);
        logger.info(`  Found ${placeUrls.length} place URLs`);

        for (const [index, url] of placeUrls.entries()) {
          logger.info(`  Extracting ${index + 1}/${placeUrls.length}: ${url}`);
          const lead = await extractLeadFromPage(page, url, businessType, location);
          if (lead) {
            collected.push(lead);
            logger.info(`    -> OK: ${lead.name}`);
          } else {
            logger.warn(`    -> skipped (no data)`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  return collected;
};
