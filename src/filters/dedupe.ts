import type { RawLead } from "../types.js";

const normalize = (value: string): string => value.trim().toLowerCase();

export const dedupeLeads = (leads: RawLead[]): RawLead[] => {
  const seen = new Set<string>();
  const result: RawLead[] = [];

  for (const lead of leads) {
    const key = [normalize(lead.name), normalize(lead.city), normalize(lead.phone || lead.website)].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(lead);
  }

  return result;
};
