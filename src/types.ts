export type Priority = "high" | "medium" | "low";

export interface RawLead {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;       // scraped directly from Google Maps or the business website
  website: string;
  rating: number | null;
  reviews: number | null;
  niche: string;
}

export interface EnrichedLead extends RawLead {
  priority: Priority;
  problem: string;
  coldEmail: string;   // AI-generated cold outreach email
  call_note: string;
}

export interface ProspectingConfig {
  niches: string[];
  cities: string[];
  defaultLimitPerSearch: number;
}
