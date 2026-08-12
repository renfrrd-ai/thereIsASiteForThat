import Link from "next/link";

import { RevealList } from "@/components/ui/RevealList";
import { VisitSiteLink } from "@/features/search/VisitSiteLink";
import type { SearchMode, SearchResultItem } from "@/features/search/types";
import { accentStyle } from "@/lib/design/accent";
import { pricingLabel } from "@/lib/utils/pricing";

type SearchResultsListProps = {
  query: string;
  mode: SearchMode;
  results: SearchResultItem[];
  aiSummary?: string | null;
  compact?: boolean;
  /** Row the keyboard is currently on, in compact (popover) mode. */
  activeIndex?: number;
};

function modeLabel(mode: SearchMode): string {
  switch (mode) {
    case "curated":
      return "Curated";
    case "soft":
      return "Closest";
    case "keyword":
      return "Catalog";
    case "ai_inferred":
      return "AI inferred";
    case "discovered":
      return "Found for you";
    case "assist_failed":
      return "Catalog only";
    case "empty":
      return "No matches";
    case "unavailable":
      return "Unavailable";
  }
}

/**
 * A discovered site has no detail page yet: it only becomes a catalog entry
 * once someone clicks through. Until then its name links straight out to the
 * site, and that click is what files it away.
 */
function clickSource(
  result: SearchResultItem,
): "search" | "ai_inferred" | "ai_discovered" {
  if (result.source === "ai_discovered") {
    return "ai_discovered";
  }
  return result.source === "ai_inferred" ? "ai_inferred" : "search";
}

export function SearchResultsList({
  query,
  mode,
  results,
  aiSummary,
  compact = false,
  activeIndex = -1,
}: SearchResultsListProps) {
  if (results.length === 0) {
    return (
      <div className={compact ? "px-6 py-6" : "py-16"}>
        <p className="label">{modeLabel(mode)}</p>
        <p className="copy mt-3 max-w-md text-[var(--muted)]">
          {aiSummary ?? "Nothing yet. Try a shorter task phrase."}
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- compact */
  if (compact) {
    return (
      <div>
        {aiSummary ? (
          <div className="px-6 pb-1 pt-5">
            <p className="label label-accent">{modeLabel(mode)}</p>
            <p className="copy mt-2 text-sm text-[var(--muted)]">
              {aiSummary}
            </p>
          </div>
        ) : null}
        <ul className="p-2">
          {results.map((result, index) => {
            const rowClass =
              "row flex items-center gap-4 rounded-[var(--r-m)] px-4 py-3.5 data-active:bg-[var(--layer-2)]";
            const body = (
              <>
                <span className="numeral row-index w-6 shrink-0 text-sm text-[var(--muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--ink)]">
                    {result.name}
                  </span>
                  <span className="copy block truncate text-sm text-[var(--muted)]">
                    {result.description}
                  </span>
                </span>
                <span className="numeral shrink-0 text-lg text-[var(--ink)]">
                  {result.confidencePercent}
                  <span className="text-[var(--muted)]">%</span>
                </span>
              </>
            );

            return (
              <li key={result.siteId}>
                {result.source === "ai_discovered" ? (
                  <VisitSiteLink
                    href={result.url}
                    siteId={result.siteId}
                    query={query}
                    source="ai_discovered"
                    confidence={result.confidence}
                    className={rowClass}
                    active={index === activeIndex}
                  >
                    {body}
                  </VisitSiteLink>
                ) : (
                  <Link
                    href={`/site/${result.slug}`}
                    data-active={index === activeIndex ? "" : undefined}
                    aria-current={index === activeIndex ? "true" : undefined}
                    className={rowClass}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  /* ------------------------------------------------------------------- full */
  const [best, ...rest] = results;

  return (
    <div>
      <BestMatch query={query} result={best} mode={mode} summary={aiSummary} />

      {rest.length > 0 ? (
        <section className="mt-20">
          <div className="flex items-baseline justify-between gap-4">
            <p className="label">Also worth it</p>
            <p className="label">{rest.length} more</p>
          </div>
          <RevealList className="mt-6" initial={3} label="more matches">
            {rest.map((result, index) => (
              <li key={result.siteId}>
                <div className="row group flex flex-col gap-4 rounded-[var(--r-l)] px-4 py-7 sm:flex-row sm:items-center sm:gap-8 sm:px-5 sm:py-8">
                  <span className="numeral w-8 shrink-0 text-base text-[var(--muted)]">
                    {String(index + 2).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    {result.source === "ai_discovered" ? (
                      <VisitSiteLink
                        href={result.url}
                        siteId={result.siteId}
                        query={query}
                        source="ai_discovered"
                        confidence={result.confidence}
                        className="headline text-2xl text-[var(--ink)] hover-ink-accent sm:text-3xl"
                      >
                        {result.name}
                      </VisitSiteLink>
                    ) : (
                      <Link
                        href={`/site/${result.slug}`}
                        className="headline text-2xl text-[var(--ink)] hover-ink-accent sm:text-3xl"
                      >
                        {result.name}
                      </Link>
                    )}
                    <p className="copy mt-2 max-w-2xl">{result.description}</p>
                    <p className="label mt-3">
                      {pricingLabel(result.pricing)}
                      {result.source === "ai_discovered" ? " · New find" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-5">
                    <span className="numeral text-3xl text-[var(--ink)] sm:text-4xl">
                      {result.confidencePercent}
                      <span className="text-[var(--muted)]">%</span>
                    </span>
                    <VisitSiteLink
                      href={result.url}
                      siteId={result.siteId}
                      query={query}
                      source={clickSource(result)}
                      confidence={result.confidence}
                      className="btn btn-quiet h-11"
                    >
                      Visit
                    </VisitSiteLink>
                  </div>
                </div>
              </li>
            ))}
          </RevealList>
        </section>
      ) : null}
    </div>
  );
}

function BestMatch({
  query,
  result,
  mode,
  summary,
}: {
  query: string;
  result: SearchResultItem;
  mode: SearchMode;
  summary?: string | null;
}) {
  const discovered = result.source === "ai_discovered";

  return (
    <section
      style={accentStyle(result.slug)}
      className="slab-accent enter overflow-hidden p-7 sm:p-12"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="label text-[var(--on-accent)]/75">
          {modeLabel(mode)} best match
        </p>
        <p className="label text-[var(--on-accent)]/75">
          {pricingLabel(result.pricing)}
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {discovered ? (
            <VisitSiteLink
              href={result.url}
              siteId={result.siteId}
              query={query}
              source="ai_discovered"
              confidence={result.confidence}
              className="display block break-words text-[3.25rem] leading-[0.85] text-[var(--on-accent)] sm:text-8xl"
            >
              {result.name}
            </VisitSiteLink>
          ) : (
            <Link
              href={`/site/${result.slug}`}
              className="display block break-words text-[3.25rem] leading-[0.85] text-[var(--on-accent)] sm:text-8xl"
            >
              {result.name}
            </Link>
          )}
          <p className="lede mt-6 max-w-xl text-[var(--on-accent)]/85">
            {summary ?? result.description}
          </p>
        </div>

        <div className="shrink-0 lg:text-right">
          <p className="numeral text-[5.5rem] leading-[0.75] text-[var(--on-accent)] sm:text-[9rem]">
            {result.confidencePercent}
            <span className="text-[0.4em] align-super">%</span>
          </p>
          <p className="label mt-3 text-[var(--on-accent)]/75">Confidence</p>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <VisitSiteLink
          href={result.url}
          siteId={result.siteId}
          query={query}
          source={clickSource(result)}
          confidence={result.confidence}
          className="btn h-14 bg-[var(--on-accent)] px-8 text-[var(--accent)] hover:bg-[var(--on-accent)]/85"
        >
          Visit {result.name}
        </VisitSiteLink>
        {discovered ? (
          <p className="label text-[var(--on-accent)]/75">
            New find · opening it adds it to the catalog
          </p>
        ) : (
          <Link
            href={`/site/${result.slug}`}
            className="btn h-14 px-8 text-[var(--on-accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--on-accent)_30%,transparent)] hover:bg-[var(--on-accent)] hover:text-[var(--accent)]"
          >
            Pros &amp; cons
          </Link>
        )}
      </div>
    </section>
  );
}
