# CRM

A single-tenant CRM that is one React app over one Hono router over one hosted SQLite database.
`/` redirects to `/crm`, and everything else is a view on the same seven objects: companies, people,
deals, projects, feedback, users, workspaces.

**It ships with no records.** The database is [Turso](https://turso.tech) and it is the only
datastore: no local SQLite file, no seed fixtures, no bundled fallback. A fresh clone against a fresh
database gives you an empty CRM with a working schema, not somebody else's contacts.

## What is in it

- A spreadsheet-style record grid with server-side paging, sorting and a per-object column picker
- A record page that reads its fields out of the attribute catalog, so a new column in the database
  renders correctly with no code change
- A drag-and-drop pipeline board that writes moves straight back through the record endpoint
- An accounts map (MapLibre) that keeps a checked address and a geocoded city centre visually apart
- Tasks, notes, an overview counted entirely in SQL, and a shared-password gate in front of all of it

## Stack

React 19, Vite 8, TypeScript 7, TanStack Router and Query, Tailwind 4, Radix primitives, Hono, Zod 4,
Biome. Runtime is [Bun](https://bun.sh).

## Running it

You need Bun 1.2+ and a Turso database.

```bash
bun install
cp .env.example .env            # fill in TURSO_DATABASE_URL_CRM and TURSO_API_KEY_CRM
bun scripts/migrate.ts          # creates every table and describes it in the catalog
bun run dev                     # client on 3594, API on 4594
```

`dev` runs two processes: Vite and the Hono router. They are separate scripts (`dev:web`, `dev:api`)
if you would rather supervise them yourself. The API port has to be the Vite port plus 1000, because
that is where the dev proxy sends `/api`, `/login` and `/logout`.

`migrate.ts` is additive and idempotent: every table is `if not exists`, every column is added only
when it is missing, and nothing is dropped, renamed or retyped. It is safe against a database that
already holds data, which is the property that makes anyone actually run it. `--dry-run` prints the
statements without executing them.

### Configuration

None of these has a default in code. A missing one throws a sentence naming the variable rather than
booting cleanly against nothing.

| Variable | What it is |
| --- | --- |
| `TURSO_DATABASE_URL_CRM` | Which database. Ordinary config, set per environment |
| `TURSO_API_KEY_CRM` | The database token. A rotating secret, set it on the platform |
| `CRM_PASSWORD` | The one password in front of the app. Unset locally means no gate; unset in production means the app serves nothing |

### What a clone gets, and what it does not

The CRM itself works against an empty database: the grid, the record pages, tasks, notes, the
overview, the map and the pipeline board all read the schema `migrate.ts` created.

The scripts under `scripts/` are a second thing, and half of them will not run for you. The outbound
automation reads its tunables, its taxonomy and its recipient vetoes out of tables that
`scripts/seed-turso.ts` fills from a private payload, so those scripts stop with a named refusal
rather than a default. That is deliberate: the alternative is an automation that writes email in
somebody's name from values it invented. `scripts/services.ts` likewise wants a host and a key for a
scraping and enrichment API that is not part of this repo.

Two identifiers name the original deployment and want changing if you run your own:
`allowedHosts` in `vite.config.ts`, and the `USER_AGENT` in `scripts/geocode-places.ts`, which
Nominatim's usage policy requires to identify whoever is actually making the requests.

## Checks and deploy

```bash
bun run check    # Biome, a 300-line-per-file cap, an import gate, then tsc --noEmit
bun run build
```

`bun run check` is a gate, not a suggestion: `as` is banned by a Grit plugin, every file stays under
300 lines, and the typechecker runs in full `strict` with `noUncheckedIndexedAccess`. A push to
`main` runs the same two commands in CI and only then deploys to Fly.

`fly.toml` and `.github/workflows/deploy.yml` name the original Fly app and region. Point them at
your own, or delete both: nothing about the app requires Fly, it is one Bun process serving a static
build and an API.

## Reading further

`CLAUDE.md` is the long form: why the grid is hand-written, why sorting had to move to the server,
why the map keeps two registers of coordinates apart, and what each of the endpoints is for. It is
written for an agent working in this repo, and it is the honest architecture document.

## License

MIT. See `LICENSE`.
