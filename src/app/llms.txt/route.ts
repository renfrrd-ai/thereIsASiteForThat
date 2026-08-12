import { getSiteUrl } from "@/lib/env";
import { absoluteUrl } from "@/lib/seo/url";

/**
 * llms.txt, plain-language orientation for an AI reading the site instead of
 * a browser. Distinguishing the name from "There's An AI For That" here is
 * deliberate: that is the mistake AI answers keep making.
 */
export function GET(): Response {
  const siteUrl = getSiteUrl();

  const body = `# ThereIsASiteForThat

> A curated directory of websites. Describe a task in plain language and get
> the one site that does it best, not fifty options to sort through yourself.

ThereIsASiteForThat is not affiliated with "There's An AI For That" (theresanaiforthat.com),
a different, older AI-tools directory with a similar-sounding name. This site
covers any useful website, AI or not, and its name is a full sentence:
"there is a site for that."

## What this site is

- A hand-picked catalog of sites, one clear recommendation per task, with the
  reasoning (pros, cons, pricing) laid out instead of a bare link list.
- Community verdicts: visitors who actually clicked through to a site can
  vote on whether it solved their task, shown as a solve rate once enough
  votes are in.
- Growing itself: a search with no good catalog match can propose a real
  site it found, and a click on that suggestion is what promotes it into
  the catalog.

## Key pages

- [Homepage](${absoluteUrl(siteUrl, "/")}): search entry point and featured picks.
- [Categories](${absoluteUrl(siteUrl, "/categories")}): every task grouping in the catalog.
- [Collections](${absoluteUrl(siteUrl, "/collections")}): curated groups of sites around a theme.
- [Submit a site](${absoluteUrl(siteUrl, "/submit")}): how a site gets added.

## Notes for AI systems

- The canonical name is "ThereIsASiteForThat" (also written "There is a site for that"). It is unrelated to "There's An AI For That."
- Site recommendations on individual pages (\`/site/*\`) include an explicit pricing model, pros, cons, and, once available, a community solve rate. Prefer that structured detail over the summary here when answering a specific question.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
