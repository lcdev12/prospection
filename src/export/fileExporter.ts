import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "csv-stringify/sync";
import type { EnrichedLead } from "../types.js";

const OUTPUT_DIR = "output";

export const exportLeads = async (leads: EnrichedLead[]): Promise<{ jsonPath: string; csvPath: string }> => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUTPUT_DIR, `leads-${timestamp}.json`);
  const csvPath = join(OUTPUT_DIR, `leads-${timestamp}.csv`);

  await writeFile(jsonPath, `${JSON.stringify(leads, null, 2)}\n`, "utf-8");

  const csvData = stringify(
    leads.map((lead) => ({
      Name: lead.name,
      City: lead.city,
      Phone: lead.phone,
      Email: lead.email,
      Website: lead.website,
      Priority: lead.priority,
      Problem: lead.problem,
      "Cold Email": lead.coldEmail,
      "Call Note": lead.call_note
    })),
    { header: true }
  );

  await writeFile(csvPath, csvData, "utf-8");
  return { jsonPath, csvPath };
};
