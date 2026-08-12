import { scoreSeedSearch } from "@/lib/catalog/seed-catalog";
import {
  getMinHitSimilarity,
  getSearchConfidenceThreshold,
  hasOpenAIConfigured,
  isDiscoveryEnabled,
} from "@/lib/env";
import { listCategories } from "@/lib/repositories/categories";
import {
  getCachedQueryEmbedding,
  setCachedQueryEmbedding,
} from "@/lib/repositories/query-cache";
import {
  countPublishedWithEmbeddings,
  searchPublishedByEmbedding,
  searchPublishedByKeyword,
  type SimilarityHit,
} from "@/lib/repositories/search";
import { upsertSearchPageHit } from "@/lib/repositories/search-pages";
import {
  cacheDiscoveryHits,
  getCachedDiscoveryHits,
  ingestDiscoveredSites,
} from "@/lib/services/discovery";
import { embedText } from "@/lib/services/embeddings";
import {
  orderHitsByRagIds,
  recommendFromCandidates,
} from "@/lib/services/rag";
import { normalizeQuery } from "@/lib/utils/normalize-query";
import { slugify } from "@/lib/utils/slugify";

export type SearchResultItem = {
  siteId: string;
  name: string;
  slug: string;
  url: string;
  description: string;
  pricing: SimilarityHit["pricing"];
  rating: number;
  tags: string[];
  confidence: number;
  confidencePercent: number;
  source: "curated" | "keyword" | "ai_inferred" | "ai_discovered";
};

export type SearchResponseData = {
  query: string;
  slug: string;
  mode:
    | "curated"
    | "soft"
    | "keyword"
    | "ai_inferred"
    | "discovered"
    /** The assist step was attempted and did not come back. Not the same as "weak". */
    | "assist_failed"
    | "empty"
    | "unavailable";
  results: SearchResultItem[];
  aiSummary: string | null;
  threshold: number;
};

const RAG_CANDIDATE_LIMIT = 12;
/**
 * Floor for the keyword and seed paths only.
 *
 * Those score with pg_trgm and a hand-rolled term match, not cosine distance,
 * so they sit on a different scale entirely: an exact searchText match is
 * worth 0.4 there. Judging them against the vector floor would throw away
 * good keyword hits, so they keep the old permissive cut.
 */
const MIN_HIT_SIMILARITY = 0.05;
/** Below this, a catalog hit ranks under a fresh find from the open web. */
const WEAK_CANDIDATE_SIMILARITY = 0.6;

function toResult(
  hit: SimilarityHit,
  source: SearchResultItem["source"],
): SearchResultItem {
  const confidence = Math.max(0, Math.min(1, hit.similarity));
  return {
    siteId: hit.id,
    name: hit.name,
    slug: hit.slug,
    url: hit.url,
    description: hit.description,
    pricing: hit.pricing,
    rating: Number.parseFloat(hit.rating),
    tags: hit.tags,
    confidence,
    confidencePercent: Math.round(confidence * 100),
    source,
  };
}

function seedHits(query: string, limit: number): SimilarityHit[] {
  return scoreSeedSearch(query, limit).map((site) => ({
    id: site.id,
    name: site.name,
    slug: site.slug,
    url: site.url,
    description: site.description,
    pricing: site.pricing,
    rating: site.rating.toFixed(1),
    tags: site.tags,
    similarity: site.similarity,
  }));
}

async function getQueryEmbedding(queryNormalized: string): Promise<number[]> {
  const cached = await getCachedQueryEmbedding(queryNormalized);
  if (cached) {
    return cached;
  }

  const embedding = await embedText(queryNormalized);
  try {
    await setCachedQueryEmbedding(queryNormalized, embedding);
  } catch (error) {
    console.error("Failed to cache query embedding:", error);
  }
  return embedding;
}

type FallbackOutcome = {
  hits: SimilarityHit[];
  /** Ids of hits that came from outside the catalog, for per-row labelling. */
  discoveredIds: Set<string>;
  mode: SearchResponseData["mode"];
  source: SearchResultItem["source"];
  aiSummary: string;
};

/**
 * Interleave open-web finds with catalog hits by how well each actually
 * matches. Strong catalog hits stay on top; anything the vector search was
 * unsure about drops below a site the model found for this exact task.
 */
function mergeHits(
  ranked: SimilarityHit[],
  discovered: SimilarityHit[],
): { hits: SimilarityHit[]; discoveredIds: Set<string> } {
  if (discovered.length === 0) {
    return { hits: ranked, discoveredIds: new Set() };
  }

  // A discovered site that has since been published can come back from the
  // vector search too. Then it is simply a catalog hit, listed once.
  const rankedIds = new Set(ranked.map((hit) => hit.id));
  const fresh = discovered.filter((hit) => !rankedIds.has(hit.id));

  const strong = ranked.filter((hit) => hit.similarity >= WEAK_CANDIDATE_SIMILARITY);
  const weak = ranked.filter((hit) => hit.similarity < WEAK_CANDIDATE_SIMILARITY);

  return {
    hits: [...strong, ...fresh, ...weak],
    discoveredIds: new Set(fresh.map((hit) => hit.id)),
  };
}

/**
 * The catalog had nothing convincing, so stop treating it as the whole world.
 *
 * One model call both re-ranks the loose candidates and names real sites that
 * are missing from the catalog. Those get parked as drafts and returned, and a
 * click on one publishes it, so the next person searching this finds it in the
 * catalog proper. The run is cached per query so a repeated miss is free.
 */
async function applyRagFallback(
  query: string,
  candidates: SimilarityHit[],
  allowDiscovery: boolean,
): Promise<FallbackOutcome> {
  const discoveryConfigured = isDiscoveryEnabled();
  const discoveryOn = allowDiscovery && discoveryConfigured;

  /**
   * A finished run is a plain DB read, so it is served even where a fresh run
   * is not allowed: the keystroke-by-keystroke popover still shows web finds
   * for a query somebody already ran, it just never pays for a new one.
   */
  if (discoveryConfigured) {
    const cached = await getCachedDiscoveryHits(query);
    if (cached && cached.length > 0) {
      const merged = mergeHits(candidates, cached);
      return {
        hits: merged.hits,
        discoveredIds: merged.discoveredIds,
        mode: "discovered",
        source: "curated",
        aiSummary:
          "Not in the curated catalog yet, so here is what fits from the wider web.",
      };
    }
  }

  /**
   * No model call on the fast path.
   *
   * This branch runs on every weak match, including the ones the search box
   * fires while the user is still typing, and the call costs seconds. So an
   * as-you-type lookup answers instantly with the closest catalog rows, and
   * the results page is where the model gets to think.
   */
  if (!discoveryOn) {
    return {
      hits: candidates,
      discoveredIds: new Set(),
      mode: candidates.length > 0 ? "soft" : "empty",
      source: "curated",
      aiSummary:
        candidates.length > 0
          ? "No strong curated match yet. Closest catalog sites below."
          : discoveryConfigured
            ? "Nothing curated for this yet. Press Enter and I'll look beyond the catalog."
            : "No matches in the catalog. Try a simpler task phrase.",
    };
  }

  const categorySlugs = await listCategories()
    .then((rows) => rows.map((row) => row.slug))
    .catch(() => []);

  const recommendation = await recommendFromCandidates(
    query,
    candidates,
    categorySlugs,
  );

  if (recommendation) {
    const notes =
      recommendation.notes.length > 0
        ? ` ${recommendation.notes.slice(0, 2).join(" ")}`
        : "";
    const summary = `${recommendation.summary}${notes}`;
    const ranked = orderHitsByRagIds(candidates, recommendation.rankedSiteIds);

    let discovered: SimilarityHit[] = [];
    if (discoveryOn && recommendation.discovered.length > 0) {
      discovered = await ingestDiscoveredSites({
        query,
        discovered: recommendation.discovered,
        knownUrls: candidates.map((hit) => hit.url),
      });
      await cacheDiscoveryHits(query, discovered);
    }

    if (ranked.length > 0 || discovered.length > 0) {
      const merged = mergeHits(ranked, discovered);
      return {
        hits: merged.hits,
        discoveredIds: merged.discoveredIds,
        mode: discovered.length > 0 ? "discovered" : "ai_inferred",
        source: "ai_inferred",
        aiSummary: summary,
      };
    }

    // Model judged candidates unhelpful, keep the explanation, avoid junk rows.
    return {
      hits: [],
      discoveredIds: new Set(),
      mode: "empty",
      source: "ai_inferred",
      aiSummary: summary,
    };
  }

  /**
   * The model was asked and did not answer.
   *
   * This used to return the same "no strong curated match" wording as the fast
   * path above, which made a broken model call indistinguishable from one we
   * deliberately never made: same mode, same sentence, same rows. Nobody could
   * tell how often the assist was failing, including us. It gets its own mode
   * so the page can say something true and so the two show up separately in
   * anything that reads mode later.
   */
  console.error(
    `Search assist failed, falling back to raw catalog ranking. query=${JSON.stringify(query)} candidates=${candidates.length}`,
  );

  if (candidates.length > 0) {
    return {
      hits: candidates,
      discoveredIds: new Set(),
      mode: "assist_failed",
      source: "curated",
      aiSummary:
        "The assist step did not finish, so this is the plain catalog ranking. Searching again usually fixes it.",
    };
  }

  return {
    hits: [],
    discoveredIds: new Set(),
    mode: "empty",
    source: "curated",
    aiSummary: "No matches in the catalog. Try a simpler task phrase.",
  };
}

/**
 * Log that this query was searched, and with what.
 *
 * Counted once per page view: `hit_count` is what promotes a search page to
 * indexable, so a page that renders in two passes must not record twice.
 */
export async function recordSearchPageHit(input: {
  query: string;
  slug: string;
  mode: SearchResponseData["mode"];
  results: SearchResultItem[];
  threshold?: number;
}): Promise<void> {
  const { query, slug, mode, results } = input;

  if (results.length === 0 || results[0]?.siteId.startsWith("seed_")) {
    return;
  }

  try {
    const threshold = input.threshold ?? getSearchConfidenceThreshold();
    const topConfidence = results[0]?.confidence ?? 0;

    await upsertSearchPageHit({
      query,
      slug,
      lastResultsJson: results.slice(0, 5),
      hasSolidResult: mode === "curated" || topConfidence >= threshold,
    });
  } catch (error) {
    console.error("Failed to upsert search page hit:", error);
  }
}

export async function searchSites(input: {
  query: string;
  limit?: number;
  recordPageHit?: boolean;
  /**
   * Whether this search may spend a model call finding sites outside the
   * catalog. Off for as-you-type lookups, which fire on every keystroke and
   * would each pay for a run on a query the user has not finished writing.
   * The results page turns it on.
   */
  allowDiscovery?: boolean;
}): Promise<SearchResponseData> {
  const query = normalizeQuery(input.query);
  const slug = slugify(query);
  const limit = input.limit ?? 8;
  const threshold = getSearchConfidenceThreshold();
  const recordPageHit = input.recordPageHit ?? true;
  const allowDiscovery = input.allowDiscovery ?? false;

  if (query.length < 2) {
    return {
      query,
      slug,
      mode: "empty",
      results: [],
      aiSummary: null,
      threshold,
    };
  }

  let hits: SimilarityHit[] = [];
  let source: SearchResultItem["source"] = "curated";
  let mode: SearchResponseData["mode"] = "curated";
  let aiSummary: string | null = null;
  /**
   * Whether these hits carry cosine similarity, which is the only scale the
   * vector floor is calibrated for. Keyword and seed results are scored by a
   * different measure and are judged against MIN_HIT_SIMILARITY instead.
   */
  let vectorRanked = false;
  let discoveredIds = new Set<string>();

  try {
    if (hasOpenAIConfigured()) {
      const embeddedCount = await countPublishedWithEmbeddings();
      if (embeddedCount === 0) {
        const keywordHits = await searchPublishedByKeyword(query, limit);

        // No embeddings yet is no reason to answer "nothing exists".
        if (keywordHits.length === 0) {
          const fallback = await applyRagFallback(query, [], allowDiscovery);
          if (fallback.hits.length > 0) {
            hits = fallback.hits;
            discoveredIds = fallback.discoveredIds;
            source = fallback.source;
            mode = fallback.mode;
            aiSummary = fallback.aiSummary;
          } else {
            hits = seedHits(query, limit);
            source = "keyword";
            mode = hits.length > 0 ? "keyword" : "empty";
            aiSummary = fallback.aiSummary;
          }
        } else {
          hits = keywordHits;
          source = "keyword";
          mode = "keyword";
          aiSummary =
            "Showing catalog matches. Add embeddings later for stronger semantic ranking.";
        }
      } else {
        vectorRanked = true;
        const embedding = await getQueryEmbedding(query);
        const candidateLimit = Math.max(limit, RAG_CANDIDATE_LIMIT);
        const candidates = await searchPublishedByEmbedding(
          embedding,
          candidateLimit,
        );
        const top = candidates[0]?.similarity ?? 0;

        if (candidates.length > 0 && top >= threshold) {
          hits = candidates.slice(0, limit);
          source = "curated";
          mode = "curated";
          aiSummary = null;
        } else {
          const rag = await applyRagFallback(query, candidates, allowDiscovery);
          hits = rag.hits.slice(0, limit);
          discoveredIds = rag.discoveredIds;
          mode = rag.mode;
          source = rag.source;
          aiSummary = rag.aiSummary;
        }
      }
    } else {
      try {
        hits = await searchPublishedByKeyword(query, limit);
      } catch {
        hits = [];
      }
      if (hits.length === 0) {
        hits = seedHits(query, limit);
      }
      source = "keyword";
      mode = hits.length > 0 ? "keyword" : "empty";
      aiSummary =
        hits.length > 0
          ? "Keyword matches from the curated catalog. Semantic ranking unlocks when OPENAI_API_KEY is set and embeddings are generated."
          : "No matches in the catalog. Try a simpler task phrase.";
    }
  } catch (error) {
    console.error("Search failed, using seed catalog:", error);
    hits = seedHits(query, limit);
    source = "keyword";
    mode = hits.length > 0 ? "keyword" : "unavailable";
    aiSummary =
      hits.length > 0
        ? "Showing bundled catalog matches while the database is offline."
        : "Search is temporarily unavailable.";
  }

  /**
   * A site the model went and found for this exact query is never measured
   * against the catalog floor. It carries a fixed confidence rather than a
   * cosine score, so the comparison would be meaningless.
   */
  const floor = vectorRanked ? getMinHitSimilarity() : MIN_HIT_SIMILARITY;
  const results = hits
    .filter((hit) => discoveredIds.has(hit.id) || hit.similarity >= floor)
    .map((hit) =>
      toResult(hit, discoveredIds.has(hit.id) ? "ai_discovered" : source),
    );

  if (recordPageHit) {
    await recordSearchPageHit({
      query,
      slug,
      mode,
      results,
      threshold,
    });
  }

  /**
   * The floor can empty a list that had rows in it a moment ago, and a page
   * headed "Closest" with nothing under it reads as a bug. A failed assist
   * keeps its own mode either way: that it found nothing is the less useful
   * half of what happened.
   */
  const nothingLeft = results.length === 0;
  const finalMode =
    nothingLeft && mode !== "assist_failed" && mode !== "unavailable"
      ? "empty"
      : mode;

  return {
    query,
    slug,
    mode: finalMode,
    results,
    aiSummary:
      nothingLeft && finalMode === "empty"
        ? "Nothing in the catalog is close enough to be worth showing. Try describing the task differently."
        : aiSummary,
    threshold,
  };
}

export function queryFromSearchSlug(slug: string, storedQuery?: string | null): string {
  if (storedQuery && storedQuery.trim().length >= 2) {
    return storedQuery.trim();
  }
  return slug
    .split("-")
    .filter(Boolean)
    .join(" ");
}
