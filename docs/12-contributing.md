# Contributing

How to send a change here without it bouncing back.

---

## Before you start

Read [01-prd.md](./01-prd.md) for the what and why. If you are touching the interface, [06-ux-design.md](./06-ux-design.md) is not optional, see below. Setup is in [10-setup.md](./10-setup.md).

---

## Interface changes

The design has rules, written down in [06-ux-design.md](./06-ux-design.md). The ones that get missed:

| Rule | Effect |
|---|---|
| Black is home, colour is a destination | Each category, collection and site owns one accent colour |
| Progressive disclosure by default | Hide what does not help the next decision |
| No dashes in copy | Full stop, comma or slash instead |
| Nothing performs for attention | No counters, odometers or cycling placeholders |

A PR that breaks one of these gets asked to fix it before review continues.

---

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm run build
```

For UI or frontend changes, run `npm run dev` and click through the change yourself. Type checking and lint verify the code compiles, not that the feature works.

Smoke checks worth rerunning if you touched search, voting or submissions are listed at the bottom of [10-setup.md](./10-setup.md).

---

## Database changes

Schema lives in `drizzle/`, generated from Drizzle ORM models.

```bash
npm run db:generate   # after editing a model, writes a new migration
npm run db:migrate    # applies pending migrations locally
```

Migrations are additive only, see decision 7 in [09-decisions.md](./09-decisions.md#7-database--orm). Do not edit a migration that has already been merged, write a new one.

---

## Commit and PR

- One logical change per PR. A schema change and an unrelated UI tweak are two PRs.
- Explain the why in the PR description, not just the what, the diff already shows the what.
- If a choice in [09-decisions.md](./09-decisions.md) needs revisiting, say so explicitly and propose the update rather than silently diverging from it.

---

## Questions

Open an issue, or check [09-decisions.md](./09-decisions.md) first, the answer to "why is it built this way" is often already there.
