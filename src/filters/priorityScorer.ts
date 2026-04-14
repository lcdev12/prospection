import type { Priority, RawLead } from "../types.js";

const outdatedWebsiteIndicators = ["wixsite.com", "jimdo", "sitebuilder", "weebly"];

const hasOutdatedWebsiteSignals = (website: string): boolean => {
  const candidate = website.toLowerCase();
  return outdatedWebsiteIndicators.some((indicator) => candidate.includes(indicator));
};

export const computePriority = (lead: RawLead): Priority => {
  if (!lead.website) {
    return "high";
  }

  const lowPresence = (lead.reviews ?? 0) < 15 || (lead.rating ?? 0) < 4;
  if (hasOutdatedWebsiteSignals(lead.website) || lowPresence) {
    return "medium";
  }

  return "low";
};

export const detectProblem = (lead: RawLead, priority: Priority): string => {
  if (!lead.website) {
    return "No website";
  }

  if (priority === "medium" && hasOutdatedWebsiteSignals(lead.website)) {
    return "Website looks outdated";
  }

  if ((lead.reviews ?? 0) < 15) {
    return "Low online presence";
  }

  return "No clear booking system";
};
