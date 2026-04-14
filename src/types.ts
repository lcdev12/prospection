export type Priority = "high" | "medium" | "low";

export interface RawLead {
  name: string;
  address: string;
  city: string;
  phone: string;
  website: string;
  rating: number | null;
  reviews: number | null;
  niche: string;
}

export interface EnrichedLead extends RawLead {
  priority: Priority;
  problem: string;
  email: string;
  call_note: string;
}

export interface ProspectingConfig {
  niches: string[];
  cities: string[];
  defaultLimitPerSearch: number;
}
