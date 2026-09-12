# 16 — Deploy to Vercel

Status: ready-for-human

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Almost nothing in the app. This closes the map's first **"Not yet specified"**
entry, *"Deployment: where the SPA is hosted, how env vars get there"*, and it
is the last thing between a built v1 and a v1 the Group can open.

The app is a **Vite SPA with no server**: no API routes, no SSR, no Vercel
Functions. Everything it needs at runtime it gets from Supabase directly from
the browser. So the whole of hosting is: serve `dist/`, serve `index.html` for
every path, and put two build-time variables in the environment.

**One browser step, the rest is CLI.** `vercel login` opens a browser because it
is an OAuth sign-in. Every other step below is a command.

## The one thing that will break it

**A Vite SPA on Vercel does not deep-link out of the box.** Vercel's own Vite
page says so: without a rewrite, any path other than `/` is a 404, because there
is no `dist/sign-in/index.html` for the CDN to find.

For this app that is not a cosmetic problem, it is a dead product:

- **`/sign-up` is reachable by URL and by nothing else** (issue 14). It is not
  linked from any screen, by design. A 404 there means nobody can ever join.
- A hard refresh anywhere but `/` dies, including on `/setup`, which is where a
  brand-new Friend is sitting the first time they arrive.
- `/design-system` likewise.

`vercel.json` is committed with this ticket and is the fix:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Taken verbatim from Vercel's Vite documentation. `vercel.ts` would also work and
is the newer programmatic format, but it needs the `@vercel/config` dependency
to express one static rewrite, which is not a trade worth making here.

## The two environment variables

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, in **Production and
Preview both**.

Two things about them that decide how this goes wrong:

- **They are read at build time, not at run time.** Vite inlines `import.meta.env`
  into the bundle. Setting them after a deploy changes nothing until you
  redeploy.
- **`src/lib/supabase.ts` throws at module load if either is missing.** The
  failure is a blank white page with one console error, not a friendly screen.
  If the first deploy renders nothing at all, check these before anything else.

Both are **public by design** and already ship inside the browser bundle where
anyone can read them. That is ADR-0001's decision, and the protection is Row
Level Security plus table grants, not secrecy. They are not secrets and do not
need to be marked sensitive. `SUPABASE_SERVICE_ROLE_KEY` must never appear here
or anywhere else.

## Decide these three before deploying

1. **One lockfile.** The repo currently has **both `yarn.lock` and
   `package-lock.json`**, and Vercel picks a package manager from whichever it
   finds. Every doc and ticket in this repo says `yarn`, so the recommendation
   is to delete `package-lock.json`. Left as it is, the install on Vercel may
   not be the install anybody has run locally.

2. **Preview deployments will write to production data.** There is one Supabase
   project, so every preview build points at the same database as production. A
   branch that draws Availability draws it on the real calendar. For a group of
   friends this is probably fine and the honest answer is to accept it
   deliberately, but it should be a decision rather than a surprise. The
   alternative is a second Supabase project and a second pair of variables
   scoped to Preview.

3. **The domain.** A `friens-cal-*.vercel.app` subdomain is enough for a group
   who will paste the link into a chat. A custom domain is `vercel domains add`
   plus DNS, and nothing in the app depends on the hostname.

## Steps

```bash
npm i -g vercel
vercel login                 # the one browser step
vercel link                  # single project, creates .vercel/project.json
```

Then the two variables, for both environments. Reading them out of the local
`.env` so they cannot be mistyped:

```bash
grep '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | vercel env add VITE_SUPABASE_URL production
grep '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | vercel env add VITE_SUPABASE_URL preview
grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2- | vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2- | vercel env add VITE_SUPABASE_PUBLISHABLE_KEY preview
vercel env ls                # four rows
```

Then a preview, then production:

```bash
vercel deploy                # preview URL on stdout
vercel deploy --prod
```

Optionally, push-to-deploy:

```bash
vercel git connect           # uses the existing origin remote
```

Vercel should detect the **Vite** preset by itself: build `npm run build`
(which is `tsc -b && vite build`), output `dist`. If the detection is wrong the
build will say so; do not pre-set it.

## What to check on the Supabase side

Expected to be **nothing**, and worth confirming rather than assuming.

The client is password auth with `flowType: 'pkce'` and
`detectSessionInUrl: false`, and ticket 13 removed every email route: no
confirmation mail, no magic link, no password reset. So the Site URL and
Redirect URL allowlists, which exist for exactly those flows, are not in the
path. The `before-user-created` allowlist hook from issue 14 is a database
function and does not care where the browser is.

**What does change is who can reach the front door.** Until now the app has only
ever run on `localhost`. A public URL means anyone can load `/sign-up` and try,
and the allowlist is the only thing standing there. That is what issue 14 built
it for, and this is the moment it starts doing the job for real.

## Acceptance criteria

- [ ] A cold visit to `/sign-up` on the deployed origin renders the form rather
      than a 404, and a hard refresh on `/setup` survives
- [ ] `vercel env ls` shows both variables in Production and Preview, and the
      deployed bundle reaches Supabase (the calendar renders, not a white page)
- [ ] Sign in works on the deployed origin
- [ ] One real address goes through the allowlist and `/sign-up` end to end, and
      an address that is not on the allowlist is refused with issue 14's single
      sentence
- [ ] Availability drawn on the deployed origin persists across a reload
- [ ] The lockfile question is settled, one file left in the repo
- [ ] The preview-writes-to-production-data decision is recorded here
- [ ] The map's **"Not yet specified → Deployment"** entry is struck, with the
      production URL written into it

## Not in this ticket

- **Anything that needs a server.** There is nothing to run: no Functions, no
  middleware, no SSR. If that changes, it is a different ticket.
- **CI.** Push-to-deploy via `vercel git connect` is offered above and is one
  command; a GitHub Actions pipeline that runs `yarn test`, `tsc -b` and
  `yarn lint` as a deployment gate is worth having and is not this.
- **A staging Supabase project**, unless decision 2 goes that way.

## Comments

### The three decisions, settled — 2026-09-12

**1. One lockfile: yarn.** `package-lock.json` is deleted. `yarn.lock` stays,
which is what every doc in this repo already assumed, and it is what Vercel will
now detect. `yarn build` reproduces the deploy build locally: `tsc -b` clean,
1,054 kB bundle, 4,092 modules, no errors.

`.vercel` is added to `.gitignore` ahead of `vercel link`, so the project link
stays out of the repo.

**2. Preview deployments write to production data. Accepted deliberately.**
One Supabase project, the same `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in Production and Preview. A branch that draws
Availability draws it on the Group's real calendar, and a branch that deletes
some deletes it for everyone.

The reasoning: the blast radius is a handful of Availability rows in a calendar
shared by friends, recoverable by drawing them again. A second Supabase project
buys isolation at the price of a second schema to migrate, a second allowlist
hook to keep in step and a second set of Friend rows to seed, all by hand,
forever. Not worth it at this size. Revisit if the Group grows past the people
who can be told "don't trust the preview link".

**3. Domain: the `*.vercel.app` subdomain.** No custom domain. Nothing in the
app depends on the hostname, and the link gets pasted into a chat.

Push-to-deploy is on via `vercel git connect`: main redeploys production, every
branch gets a preview.
