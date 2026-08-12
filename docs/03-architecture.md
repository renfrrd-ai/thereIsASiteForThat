# Technical Architecture (v1)

## 1. Stack (what we use)

| Layer | Choice | Why |
|---|---|---|
| Frontend / framework | Next.js (App Router) | SSR/SEO, API routes, Vercel-native |
| Language | TypeScript | End-to-end type safety |
| Styling | Tailwind CSS | Fast UI iteration |
| Database | **Supabase Postgres** + pgvector + pg_trgm | Hosted Postgres; pooler URI for app/migrate |
| ORM | Drizzle ORM + `postgres.js` | Thin, typed, migrations (`prepare: false` for pooler) |
| Embeddings | OpenAI `text-embedding-3-small` (1536) | Semantic ranking |
| LLM fallback | OpenAI `gpt-4o-mini` | RAG re-rank of catalog candidates on weak matches |
| End-user auth | **Auth.js (NextAuth v5)** + Google | Built but switched off, see [11](./11-user-accounts-features.md) |
| Community votes | Signed anonymous cookie, no third party | Verdicts without accounts, see [04](./04-data-model.md) |
| Admin auth | Password + signed httpOnly cookie | Separate from Google users |
| File storage | Cloudflare R2 (later) | Screenshots |
| Hosting | Vercel | Preview + production |

**Not used:** Supabase Auth / `@supabase/supabase-js`, Clerk, separate vector DB.

## 2. High-Level Diagram

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Browser     │────▶│  Next.js (Vercel)   │────▶│  Supabase        │
│  Search UI   │◀────│  App Router + APIs  │◀────│  Postgres+vector │
└──────────────┘     └──────────┬──────────┘     └──────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
         ┌───────────┐  ┌────────────┐  ┌──────────────┐
         │ OpenAI    │  │ Auth.js    │  │ Admin cookie │
         │ embed+LLM │  │ Google OAuth│  │ password     │
         └───────────┘  └────────────┘  └──────────────┘
```

## 3. Layering Rules

```
src/
  app/                  # Routes, thin handlers, loading skeletons
  auth.ts               # Auth.js (Google) config, currently unreachable
  components/
    home/               # Hero, collections, picks, category chips, submit band
    theme/              # Provider and the light/dark switch
    ui/                 # Disclosure, RevealList, PageHead, SectionHead
  features/
    search/             # Search box, results, outbound link tracking
    sites/              # Cards and lists
    votes/              # The community verdict band
    bookmarks/          # BookmarkButton, dormant with accounts
    submissions/        # Public submit form
    admin/              # Admin site form
  lib/
    db/                 # Drizzle client + schema
    design/             # Accent palette and per-entity colour assignment
    votes/              # Anonymous voter identity, cookies and hashing
    repositories/       # Data access only
    services/           # Business logic (search, RAG, votes, catalog, …)
    validators/         # Zod schemas
    utils/              # Pure helpers (rate limit, slugify, …)
    seo/                # JSON-LD + absolute URLs
```

**Rules:**

- Components do not call Drizzle or OpenAI directly.
- Route handlers validate input → call a service → return `{ success, data, error }`.
- Repositories own SQL; services own ranking, thresholds, RAG, accounts.

## 4. Key Runtime Flows

### 4.1 Search

1. Client debounces query (250-350ms); `POST /api/search` (rate-limited).
2. Embed query → pgvector cosine similarity.
3. Top ≥ `SEARCH_CONFIDENCE_THRESHOLD` (default 0.78) → curated results.
4. Else → RAG (`gpt-4o-mini`) over loose candidates → `source: "ai_inferred"`.
5. Upsert `search_pages` hit; auto-`is_indexable` after 5 solid hits.

### 4.2 Community verdicts

1. Visitor clicks through to a site. `POST /api/click` logs it **and** issues two HttpOnly cookies: a signed voter token and a short list of visited site fingerprints.
2. Back on the site page, the server reads those cookies. Only a device that actually visited sees the question.
3. `POST /api/vote` re-checks eligibility, rate limits by IP, then upserts one row per (site, voter).
4. Stored identity is `HMAC(secret, token + siteId)`, so rows cannot be joined into a browsing history.
5. Under three verdicts the page shows the editor score instead. See [06](./06-ux-design.md) for the reasoning.

### 4.3 Accounts (built, switched off)

Auth.js, `users`, `bookmarks`, `saved_searches` and `/me/*` all exist and work. The UI entry points are removed and `/signin` explains why. Turning it back on is a UI job, not a backend one.

### 4.4 Submission

1. Public form → validate → duplicate URL check (catalog + pending/approved) → insert `submissions`.
2. Rate limit: 8 submissions / IP / hour.
3. Admin approves. That **creates a draft site** carrying everything the submitter typed, and lands the admin on its edit page to add pros, cons and a score before publishing. Approve is a publish step, not a status flag.

## 5. Environments

| Env | Purpose |
|---|---|
| Local | Next.js + Supabase pooler `DATABASE_URL` |
| Preview | Vercel preview + same or staging Supabase |
| Production | Vercel + Supabase; `NEXT_PUBLIC_SITE_URL` unset, defaults to `https://www.thereisasiteforthat.com` in `getSiteUrl()` |

## 6. Env Vars (expected)

```bash
DATABASE_URL=postgresql://...           # Supabase pooler
DATABASE_URL_DIRECT=postgresql://...    # optional; often unused on WSL (IPv6)
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
AUTH_SECRET=
AUTH_GOOGLE_ID=                         # only needed when accounts are switched on
AUTH_GOOGLE_SECRET=                     # only needed when accounts are switched on
VOTE_SECRET=                            # optional; falls back to AUTH_SECRET, then ADMIN_SESSION_SECRET
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SEARCH_CONFIDENCE_THRESHOLD=0.78
```

Google redirect: `{SITE_URL}/api/auth/callback/google`

## 7. Cost / abuse control

- Cache query embeddings in `query_cache`.
- RAG only when top similarity &lt; threshold.
- Debounce client search; min 2 chars.
- Rate limit `/api/search` (60/min/IP), `/api/submit` (8/hour/IP), `/api/vote` (20/min/IP).
- Duplicate URL rejection on submit.

## 8. Failure behaviour

The catalog must render even when the parts around it are missing.

| Missing | What happens |
|---|---|
| `DATABASE_URL` | Catalog falls back to the seed data in `src/data/seed`. Search returns nothing |
| `site_votes` table (pre-migration) | Every vote read is wrapped and returns empty. Pages show editor scores |
| `OPENAI_API_KEY` | No embeddings and no RAG. Curated and keyword paths still answer |
| Click logging fails | Never blocks the outbound navigation |

## 9. Non-Goals (still)

- Separate vector DB (Pinecone/Weaviate)
- Supabase Auth / BaaS client SDK
- Multi-tenant orgs
- Real-time collaborative features
