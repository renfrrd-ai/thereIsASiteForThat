# Docs

Everything written down about **thereisasiteforthat.com**.

> Need a website to do X? Here is the best one.

## Start here

**New to the project?** Read [01-prd.md](./01-prd.md), then [06-ux-design.md](./06-ux-design.md). That is the what and the why, and it takes about fifteen minutes.

**Setting it up?** Go straight to [10-setup.md](./10-setup.md).

**Changing the interface?** [06-ux-design.md](./06-ux-design.md) is not optional reading. The design has rules, and they are written down so they survive the next feature.

## The map

| Doc | Answers |
|---|---|
| [01-prd.md](./01-prd.md) | What are we building, and for whom |
| [02-competitive-analysis.md](./02-competitive-analysis.md) | Why not just use TAAFT |
| [03-architecture.md](./03-architecture.md) | What runs where, and which layer may call which |
| [04-data-model.md](./04-data-model.md) | What the database holds |
| [05-search-pipeline.md](./05-search-pipeline.md) | How a sentence becomes a ranked answer |
| [06-ux-design.md](./06-ux-design.md) | How it looks, and the rules behind it |
| [07-seo-strategy.md](./07-seo-strategy.md) | How people find us |
| [08-roadmap.md](./08-roadmap.md) | What is done and what is next |
| [09-decisions.md](./09-decisions.md) | Why things are the way they are |
| [10-setup.md](./10-setup.md) | How to run it |
| [11-user-accounts-features.md](./11-user-accounts-features.md) | The accounts feature, and why it is switched off |
| [12-contributing.md](./12-contributing.md) | How to send a change here |

## Where the project stands

| Area | State |
|---|---|
| Catalog, categories, collections | Shipped |
| Semantic search with AI fallback | Shipped |
| Public submissions and admin review | Shipped |
| Community verdicts, no account needed | Shipped. Existing deployments need `npm run db:migrate` |
| Design system | Shipped, see [06-ux-design.md](./06-ux-design.md) |
| Accounts, bookmarks, saved searches | Built, switched off until transactional email exists |
| Production deploy | Human ops pass still required |

## The stack, briefly

Next.js App Router · Supabase Postgres with pgvector · Drizzle · OpenAI embeddings and RAG · Vercel

## Screenshots

`docs/assets/` holds captures of the shipped interface. Regenerate them from a production build so no development overlay appears:

```bash
npm run build
PORT=3100 npm start
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
"$BRAVE" --headless --disable-gpu --hide-scrollbars --window-size=1440,980 \
  --screenshot=docs/assets/home.png --virtual-time-budget=9000 http://localhost:3100/
```

Swap the path and filename for the other pages. Any Chromium build works, Brave is simply what is installed here.

## House rules for these docs

1. **One question per document.** If a doc starts answering a second question, it wants to be two docs.
2. **Lead with the answer.** Tables and short paragraphs beat walls of prose.
3. **No dashes.** Not em, not en, not as separators. Use a full stop, a comma, or a slash.
4. **Write what shipped, not what was planned.** A doc describing an intention is worse than no doc.
