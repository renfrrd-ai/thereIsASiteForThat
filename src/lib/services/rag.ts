import { z } from "zod";

import type { SimilarityHit } from "@/lib/repositories/search";
import { createChatCompletion } from "@/lib/services/openai-client";

const discoveredSiteSchema = z.object({
  name: z.string().min(1).max(80),
  url: z.string().min(4).max(400),
  description: z.string().min(1).max(400),
  pricing: z.enum(["free", "freemium", "paid", "free_trial"]),
  tags: z.array(z.string().min(1).max(40)).max(8).optional(),
  categorySlug: z.string().max(80).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const ragResponseSchema = z.object({
  summary: z.string().min(1),
  rankedSiteIds: z.array(z.string()),
  discovered: z.array(discoveredSiteSchema).optional(),
  notes: z.array(z.string()).optional(),
});

export type DiscoveredSite = z.infer<typeof discoveredSiteSchema>;

export type RagRecommendation = {
  summary: string;
  rankedSiteIds: string[];
  discovered: DiscoveredSite[];
  notes: string[];
};

/**
 * The catalog is not the limit of what the model may answer with.
 *
 * Candidates get re-ranked as before, but the model is also asked for real
 * websites that are missing from the catalog entirely. Those come back in
 * `discovered` and are ingested as drafts, so a query nobody seeded still
 * returns something useful and the catalog learns from it.
 */
const SYSTEM_PROMPT = `You recommend websites for a user task.

You get catalog candidates. Rank the ones that genuinely help. Separately, name real websites that solve the task but are NOT among the candidates.

Rules for "discovered" sites:
- Only real, well-known, currently-live websites you are confident exist. Never invent a domain or guess a URL.
- Use the canonical https homepage, no tracking parameters, no deep links.
- Do not repeat anything already in the candidate list.
- At most 4, best first. Return an empty array rather than padding with weak or uncertain entries.
- Prefer free/freemium when quality is equal.

The user is waiting on this response, so length costs them time. One short
sentence per description, at most one note, no restating the query.
If nothing fits at all, say so and suggest how to rephrase.

Respond with JSON only, no markdown:
{
  "summary": "string",
  "rankedSiteIds": ["id1", "id2"],
  "discovered": [
    {
      "name": "string",
      "url": "https://example.com",
      "description": "one sentence on what it does for this task",
      "pricing": "free" | "freemium" | "paid" | "free_trial",
      "tags": ["short", "keywords"],
      "categorySlug": "one of the provided category slugs",
      "confidence": 0.0
    }
  ],
  "notes": ["optional caveats"]
}

rankedSiteIds must be a subset of the candidate ids, best-first. Omit candidates that do not help.`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(raw) as unknown;
}

/**
 * Re-rank loose catalog candidates for a weak/empty vector match.
 * Returns null on API/parse failure so the caller can soft-fallback.
 */
export async function recommendFromCandidates(
  query: string,
  candidates: SimilarityHit[],
  categorySlugs: string[] = [],
): Promise<RagRecommendation | null> {
  const candidatePayload = candidates.map((site) => ({
    id: site.id,
    name: site.name,
    // Enough to judge relevance; the full text is just tokens to chew through.
    description: site.description.slice(0, 140),
    pricing: site.pricing,
    tags: site.tags.slice(0, 4),
    similarity: Number(site.similarity.toFixed(3)),
  }));

  try {
    const content = await createChatCompletion({
      system: SYSTEM_PROMPT,
      user: JSON.stringify({
        query,
        candidates: candidatePayload,
        categorySlugs,
      }),
      maxTokens: 550,
    });
    /**
     * Both of these used to return null without a word, which is why nobody
     * could tell an empty completion from malformed JSON from a thrown error:
     * all three arrived at the caller as the same silent null. They are logged
     * apart because the fix differs for each.
     */
    if (!content) {
      console.error(
        `RAG returned no content. query=${JSON.stringify(query)}`,
      );
      return null;
    }

    const parsed = ragResponseSchema.safeParse(extractJsonObject(content));
    if (!parsed.success) {
      console.error(
        `RAG response did not match the schema. query=${JSON.stringify(query)} issues=${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
      );
      return null;
    }

    const allowed = new Set(candidates.map((c) => c.id));
    const rankedSiteIds = parsed.data.rankedSiteIds.filter((id) => allowed.has(id));

    return {
      summary: parsed.data.summary.trim(),
      rankedSiteIds,
      discovered: parsed.data.discovered ?? [],
      notes: parsed.data.notes ?? [],
    };
  } catch (error) {
    console.error("RAG recommendation failed:", error);
    return null;
  }
}

export function orderHitsByRagIds(
  candidates: SimilarityHit[],
  rankedSiteIds: string[],
): SimilarityHit[] {
  const byId = new Map(candidates.map((hit) => [hit.id, hit]));
  const ordered: SimilarityHit[] = [];

  for (const id of rankedSiteIds) {
    const hit = byId.get(id);
    if (hit) {
      ordered.push(hit);
      byId.delete(id);
    }
  }

  return ordered;
}
