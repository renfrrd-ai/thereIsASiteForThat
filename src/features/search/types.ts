export type SearchResultItem = {
  siteId: string;
  name: string;
  slug: string;
  url: string;
  description: string;
  pricing: "free" | "freemium" | "paid" | "free_trial";
  rating: number;
  tags: string[];
  confidence: number;
  confidencePercent: number;
  source: "curated" | "keyword" | "ai_inferred" | "ai_discovered";
};

export type SearchMode =
  | "curated"
  | "soft"
  | "keyword"
  | "ai_inferred"
  | "discovered"
  /** The assist step was attempted and did not come back. Not the same as "weak". */
  | "assist_failed"
  | "empty"
  | "unavailable";

export type SearchResponseData = {
  query: string;
  slug: string;
  mode: SearchMode;
  results: SearchResultItem[];
  aiSummary: string | null;
  threshold: number;
};
