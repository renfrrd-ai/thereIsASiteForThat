function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getSearchConfidenceThreshold(): number {
  const raw = optional("SEARCH_CONFIDENCE_THRESHOLD");
  const parsed = raw ? Number.parseFloat(raw) : 0.78;
  return Number.isFinite(parsed) ? parsed : 0.78;
}

/**
 * The live domain, hardcoded on purpose.
 *
 * Canonical URLs, the sitemap, and every social card image are absolute, so
 * something has to know the real address. Relying on a hosting environment
 * variable means one unset value silently ships share previews and canonicals
 * pointing at localhost, and nobody notices until a link looks broken in a
 * chat app. The domain is not a secret and it does not change per deploy, so
 * it lives in the code where it is version controlled and reviewable.
 */
/**
 * The apex redirects here (a 308 to www), not the other way around. Pointing
 * canonical URLs at the apex meant every URL in the sitemap made a search
 * engine follow a redirect to reach the page it was already told was
 * canonical, which a Semrush crawl flagged directly.
 */
const PRODUCTION_SITE_URL = "https://www.thereisasiteforthat.com";

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function getSiteUrl(): string {
  const explicit = optional("NEXT_PUBLIC_SITE_URL")?.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "development") {
    return explicit ?? "http://localhost:3000";
  }

  /**
   * A production build must never advertise a local address, even when one is
   * configured. The deployment platform had NEXT_PUBLIC_SITE_URL set to
   * http://localhost:3000, copied out of .env.example, which meant every social
   * card told scrapers to fetch the image from their own machine and no preview
   * ever rendered. Trusting the variable blindly is what caused that, so a
   * local value is now treated as a misconfiguration rather than an intent.
   */
  if (explicit && !LOCAL_HOST.test(explicit)) {
    return explicit;
  }

  return PRODUCTION_SITE_URL;
}

/**
 * The Search Console HTML-tag token, when that verification method is used.
 * Absent is normal: DNS or the hosting integration verifies the domain just as
 * well, and an undefined value simply omits the meta tag.
 */
export function getGoogleSiteVerification(): string | undefined {
  return optional("GOOGLE_SITE_VERIFICATION");
}

export function getOpenAIEmbeddingModel(): string {
  return optional("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
}

export function getOpenAIChatModel(): string {
  return optional("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";
}

export function hasOpenAIConfigured(): boolean {
  return Boolean(optional("OPENAI_API_KEY"));
}

/**
 * Whether a weak catalog match may be answered with sites from outside the
 * catalog. On by default wherever the model is configured: a search that finds
 * nothing is the whole reason this exists. Set SEARCH_DISCOVERY=off to serve
 * only what has already been curated.
 */
export function isDiscoveryEnabled(): boolean {
  if (!hasOpenAIConfigured()) {
    return false;
  }
  const raw = optional("SEARCH_DISCOVERY")?.toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0";
}

/** How long a query's discovery run is reused before the model is asked again. */
export function getDiscoveryCacheTtlMs(): number {
  const raw = optional("SEARCH_DISCOVERY_TTL_DAYS");
  const parsed = raw ? Number.parseFloat(raw) : 7;
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  return days * 24 * 60 * 60 * 1000;
}
