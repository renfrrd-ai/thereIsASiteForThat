import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Disclosure } from "@/components/ui/Disclosure";
import { PageHead } from "@/components/ui/PageHead";
import { BookmarkButton } from "@/features/bookmarks/BookmarkButton";
import { VisitSiteLink } from "@/features/search/VisitSiteLink";
import { SiteList } from "@/features/sites/SiteList";
import { RefreshOnReturn } from "@/features/votes/RefreshOnReturn";
import { SiteVerdict } from "@/features/votes/SiteVerdict";
import { accentStyle } from "@/lib/design/accent";
import { getSiteUrl } from "@/lib/env";
import { JsonLd } from "@/lib/seo/json-ld";
import { breadcrumbList } from "@/lib/seo/schema";
import { absoluteUrl } from "@/lib/seo/url";
import { getBookmarkState } from "@/lib/services/bookmarks";
import { getVerdict, listVerdicts } from "@/lib/services/votes";
import {
  getCatalogSiteBySlug,
  listCatalogAlternatives,
} from "@/lib/services/catalog";
import { pricingLabel } from "@/lib/utils/pricing";

type SitePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: SitePageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCatalogSiteBySlug(slug);
  if (!site) {
    return { title: "Site not found" };
  }

  const siteUrl = getSiteUrl();
  return {
    title: `${site.name}: best for ${site.tags[0] ?? site.categoryName}`,
    description: site.description,
    alternates: {
      canonical: absoluteUrl(siteUrl, `/site/${slug}`),
    },
  };
}

export default async function SitePage({ params }: SitePageProps) {
  const { slug } = await params;
  const site = await getCatalogSiteBySlug(slug);
  if (!site) {
    notFound();
  }

  const [alternatives, bookmarkState, verdict] = await Promise.all([
    listCatalogAlternatives(site, 6),
    getBookmarkState(site.id),
    getVerdict(site.id),
  ]);
  const alternativeVerdicts = await listVerdicts(
    alternatives.map((item) => item.id),
  );
  const siteUrl = getSiteUrl();

  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: site.name,
    url: site.url,
    description: site.description,
    applicationCategory: site.categoryName,
    offers: {
      "@type": "Offer",
      category: pricingLabel(site.pricing),
    },
    /**
     * Only real community verdicts earn rating markup.
     *
     * The editor score used to fill in here whenever a site was short of the
     * three votes a verdict needs, which is nearly all of them, as an
     * AggregateRating of exactly one rating. An aggregate of one, assigned by
     * us rather than by users, is the self-serving pattern Google's structured
     * data policy names, and it was being served on 700+ pages at once. Those
     * snippets earned 70% of our impressions and no clicks at all, because
     * position 40 converts nothing, so the trade was pure risk. A page with
     * too few verdicts now simply claims no rating.
     */
    ...(verdict.solveRate !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(((verdict.solveRate / 100) * 5).toFixed(1)),
            bestRating: 5,
            worstRating: 1,
            ratingCount: verdict.total,
          },
        }
      : {}),
    mainEntityOfPage: absoluteUrl(siteUrl, `/site/${site.slug}`),
  };

  return (
    <main style={accentStyle(site.slug)} className="shell flex flex-1 flex-col pb-10">
      <JsonLd
        data={[
          appLd,
          breadcrumbList([
            { name: "Home", path: "/" },
            { name: "Categories", path: "/categories" },
            { name: site.categoryName, path: `/categories/${site.categorySlug}` },
            { name: site.name, path: `/site/${site.slug}` },
          ]),
        ]}
      />
      <RefreshOnReturn siteId={site.id} />

      <PageHead
        label={site.categoryName}
        labelHref={`/categories/${site.categorySlug}`}
        title={site.name}
        transitionName={`site-${site.slug}`}
        lead={site.description}
      >
        <VisitSiteLink
          href={site.url}
          siteId={site.id}
          source="detail"
          className="btn btn-accent h-14 px-8"
        >
          Visit {site.name}
        </VisitSiteLink>
        <BookmarkButton
          siteId={site.id}
          initialBookmarked={bookmarkState.bookmarked}
          bookmarkable={bookmarkState.bookmarkable}
          callbackPath={`/site/${site.slug}`}
        />
        <Link
          href={`/search/${site.tags[0] ? site.tags[0].replace(/\s+/g, "-") : site.categorySlug}`}
          className="btn btn-line h-14 px-8"
        >
          Similar searches
        </Link>
      </PageHead>

      <ul className="flex flex-wrap gap-2 pb-14">
        <li className="chip pointer-events-none">{pricingLabel(site.pricing)}</li>
        {site.tags.slice(0, 5).map((tag) => (
          <li key={tag} className="chip pointer-events-none">
            {tag}
          </li>
        ))}
      </ul>

      <SiteVerdict
        siteId={site.id}
        siteName={site.name}
        editorScore={site.rating}
        initial={verdict}
      />

      <section className="mt-24 grid gap-x-16 gap-y-12 border-t border-[var(--hair)] pt-12 md:grid-cols-2">
        <div>
          <p className="label label-accent">Pros</p>
          <ul className="mt-6 space-y-4">
            {site.pros.map((pro) => (
              <li key={pro} className="flex gap-4 text-lg leading-snug text-[var(--ink)]">
                <span className="numeral ink-accent shrink-0" aria-hidden="true">
                  +
                </span>
                <span>{pro}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label">Cons</p>
          <ul className="mt-6 space-y-4">
            {site.cons.map((con) => (
              <li key={con} className="flex gap-4 text-lg leading-snug text-[var(--muted)]">
                <span className="numeral shrink-0" aria-hidden="true">
                  ×
                </span>
                <span>{con}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {alternatives.length > 0 ? (
        <section className="mt-20">
          <Disclosure
            summary="Alternatives"
            hint={`${alternatives.length} in ${site.categoryName}`}
          >
            <SiteList
              sites={alternatives}
              showCategory={false}
              numbered={false}
              verdicts={alternativeVerdicts}
            />
          </Disclosure>
        </section>
      ) : null}
    </main>
  );
}
