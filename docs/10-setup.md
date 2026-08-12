# Local Setup Checklist

What to configure for the stack we **actually use**:

| Piece | Choice |
|---|---|
| Database | **Supabase Postgres** + `vector` + `pg_trgm` (pooler URI) |
| ORM | Drizzle + `postgres.js` |
| AI | OpenAI embeddings + chat RAG |
| Admin | Password + signed cookie |
| End users | **Auth.js + Google OAuth**, switched off, see [11](./11-user-accounts-features.md) |
| Voters | Anonymous signed cookie, nothing to configure |

We do **not** use Supabase Auth or the Supabase JS client, only the Postgres connection string.

---

## 1. Create a Supabase project

1. [https://supabase.com](https://supabase.com) → New project  
2. Note the database password  
3. **Project Settings → Database** (or Connect)

### Connection strings

| Use | Which URI | Port / mode |
|---|---|---|
| App + migrate (`DATABASE_URL`) | **Transaction** pooler | Often `6543` |
| Optional (`DATABASE_URL_DIRECT`) | Session pooler, or Direct | `5432` |

**WSL / IPv6:** Supabase **Direct** (`db.xxxx.supabase.co:5432`) is often IPv6-only and can fail with `ENETUNREACH`. Prefer the **pooler** host for `DATABASE_URL`. Leave `DATABASE_URL_DIRECT` unset, or point it at Session pooler.

URL-encode special characters in the password (e.g. `#` → `%23`).

```bash
DATABASE_URL=postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-....pooler.supabase.com:6543/postgres
# DATABASE_URL_DIRECT=   # optional; avoid Direct from WSL if IPv6 breaks
```

### Enable extensions

SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Free-tier idle

Free projects can pause after ~7 days idle. Wake from the dashboard if needed.

---

## 1b. Optional: local WSL Postgres

Only if you prefer local over Supabase (not required for this project):

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-16-pgvector
sudo service postgresql start
# create user/db + enable vector + pg_trgm, see earlier git history or Postgres docs
DATABASE_URL=postgresql://tias:tias@localhost:5432/thereisasiteforthat
```

---

## 2. Fill `.env`

```bash
cp .env.example .env
```

```bash
DATABASE_URL=...                 # Supabase pooler
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...         # openssl rand -hex 32
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
AUTH_SECRET=...                  # openssl rand -hex 32
AUTH_GOOGLE_ID=...        # only when you switch accounts back on
AUTH_GOOGLE_SECRET=...    # only when you switch accounts back on
VOTE_SECRET=...           # optional; falls back to AUTH_SECRET, then ADMIN_SESSION_SECRET
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SEARCH_CONFIDENCE_THRESHOLD=0.78
```

### Google Cloud Console

OAuth client → Authorized redirect URIs:

```text
http://localhost:3000/api/auth/callback/google
https://thereisasiteforthat.com/api/auth/callback/google
```

Google credentials are **not needed right now**. Sign-in is switched off, so `/signin` is an explainer page. Search, browse, submit, admin and voting all work without them.

---

## 3. Migrate + seed + embed

Migrations in repo: `drizzle/0000_*.sql`, `0001_*.sql` (users/bookmarks), `0002_*.sql` (saved_searches).

```bash
npm run db:migrate    # includes site_votes, added for community verdicts
npm run db:seed
npm run db:embed      # needs OPENAI_API_KEY
npm run dev
```

Smoke checks:

1. Homepage instant search (≥2 chars) with confidence %  
2. Enter → `/search/{slug}`  
3. Visit site → `POST /api/click` then outbound  
4. Click through to a site, come back, and answer "Did it solve it?"  
5. Save a search → `/me/searches`  
6. `/admin/login` with `ADMIN_PASSWORD`

---

## 3b. Upgrading a deployment that predates verdicts

One additive migration, `drizzle/0003_brown_blackheart.sql`, creates `site_votes`. Nothing existing is altered.

```bash
npm run db:migrate
```

You can deploy the code before running it. Every vote read is wrapped, so an un-migrated database renders the catalog on editor scores instead of crashing.

---

## 4. Admin vs user auth

| Path | Auth |
|---|---|
| `/admin/*` | Password cookie |
| `/me/*`, bookmarks, saved searches | Google (Auth.js), unreachable while sign-in is off |
| Voting on a site | Nothing. A signed cookie issued when you click through |
| Search, browse, submit | Public (submit rate-limited) |

---

## 5. Deploy (Vercel / similar)

1. Push to GitHub → import project  
2. Set env: `DATABASE_URL` (pooler), `OPENAI_*`, `ADMIN_*`, `AUTH_*`. Leave `NEXT_PUBLIC_SITE_URL` unset in production — the apex domain redirects to `www`, and `getSiteUrl()` already defaults to the correct `https://www.thereisasiteforthat.com` on its own. Setting this variable overrides that default, so only set it if the canonical domain ever changes.  
3. Run `npm run db:migrate` against production so `site_votes` exists  
4. Run migrate/seed/embed against the **prod** DB if it is not the same Supabase project as local  

---

## Done when

- [ ] Supabase: `vector` + `pg_trgm` enabled  
- [ ] `.env`: DB, admin, OpenAI  
- [ ] `db:migrate` / `db:seed` / `db:embed` succeed  
- [ ] Admin login works  
- [ ] Search returns ranked results  
- [ ] Voting works: visit a site, return, answer the question  
- [ ] (Prod) Vercel env + site URL set  
