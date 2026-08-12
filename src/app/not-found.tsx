import Link from "next/link";

import { EXAMPLE_QUERIES } from "@/features/search/constants";
import { SearchBox } from "@/features/search/SearchBox";
import { accentStyle } from "@/lib/design/accent";
import { slugify } from "@/lib/utils/slugify";

/**
 * The 404, which doubles as the handler for every unmatched URL on the site.
 *
 * A dead end is the one place the promise in our name can be turned on itself,
 * so the page says the quiet part and then does something about it. Being lost
 * here means you wanted something specific, and the search field is the whole
 * product, so it goes on the page rather than a link back to the home page and
 * a shrug.
 *
 * No metadata export: this file convention does not support one, and Next
 * already injects noindex on anything answering 404.
 */
export default function NotFound() {
  return (
    <main
      style={accentStyle("not-found")}
      className="shell flex flex-1 flex-col pb-10 pt-4"
    >
      <p className="label enter">Error 404</p>

      <h1 className="display enter enter-1 mt-6 max-w-4xl text-[clamp(2.5rem,8vw,6.5rem)] text-[var(--ink)]">
        There is a site for that.
        <br />
        <span className="ink-accent">This is not it.</span>
      </h1>

      <p className="lede enter enter-2 mt-8 max-w-xl text-[var(--muted)]">
        Nothing lives at this address. Everything else still does, so say what
        you need and we will point you at the one site that does it.
      </p>

      {/*
        Same stacking fix as the home hero. The entry animation holds a
        transform, which makes this a stacking context, so the popover cannot
        lift itself above the chips below without the context being raised too.
      */}
      <div className="enter enter-3 relative z-50 mt-12 sm:mt-16">
        <SearchBox autoFocus={false} />
      </div>

      <ul className="stagger enter-4 mt-6 flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.slice(0, 6).map((query, index) => (
          <li key={query} style={{ ["--i" as string]: index }}>
            <Link href={`/search/${slugify(query)}`} className="chip">
              {query}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-16 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-accent h-14 px-8">
          Back to the start
        </Link>
        <Link href="/categories" className="btn btn-line h-14 px-8">
          Browse categories
        </Link>
      </div>
    </main>
  );
}
