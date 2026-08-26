import { Hono } from "hono"
import { cors } from "hono/cors"
import { etag } from "hono/etag"
import { authRoutes, crmAuth } from "./server/auth"
import { crmDocRoutes } from "./server/crm-docs"
import { crmRoutes } from "./server/crm-routes"
import { gzipResponses, revalidateReads } from "./server/http-cache"
import { crmTarget } from "./server/turso"

/**
 * The API server.
 *
 * It used to do two jobs: serve the CRM out of Turso, and keep a local SQLite cache of a curated
 * index that was seeded from files in `src/data` on every boot. The index files held real companies
 * and are gone, so the cache has no source and the endpoints over it had no callers. What is left is
 * a router: the CRM is the only data this process serves, and Turso is the only place it comes from.
 */

// The CRM does not live here. It is a hosted Turso database — relational, one column per attribute —
// and it is the system of record.
console.log(`CRM: ${crmTarget() ?? "not configured — TURSO_DATABASE_URL_CRM is unset, /api/crm/* will fail"}`)

const app = new Hono()

app.use("/api/*", cors({ origin: origin => origin, credentials: true }))

/**
 * Gzip, above everything, including the gate and the static files.
 *
 * This was simply missing, and it was the single largest thing wrong with the app: `/api/crm/companies`
 * answered 787,341 bytes to a request that said `Accept-Encoding: gzip`, where the same body gzips to
 * 93,196. CRM JSON is mostly repeated column names and nulls — 76% of the fields in that response are
 * empty — which is the shape gzip is best at, so this is an 89% cut with no behaviour change.
 *
 * It is registered above the ETag below it on purpose. Hono runs the first-registered middleware
 * outermost, so the digest is taken over the *uncompressed* body and this re-labels it `W/` on the
 * way out. That ordering is what keeps one ETag per record set; the other way round, the same rows
 * under two encodings would be two different tags.
 */
app.use("*", gzipResponses())

app.get("/health", c => c.json({ ok: true }))

/**
 * The password gate, registered before anything it protects.
 *
 * Order is the whole of it. Hono runs middleware in the order it is added, so this sits above both
 * `/api/crm` and the static handlers below: an unauthenticated request for `/assets/index-*.js` is
 * a redirect to the login page, not the bundle. Nothing of the app is downloadable before signing
 * in, so there is no moment where the shell paints and then thinks better of it — the browser never
 * receives the HTML in the first place.
 */
app.use("*", crmAuth())
app.route("/", authRoutes())

/**
 * A thrown error still answers in the `{ error }` shape the routes use deliberately.
 *
 * Without this, missing CRM config reached the browser as a bare "Internal Server Error": the
 * connection throws a sentence naming the variable that is unset, and Hono's default handler
 * dropped it. That is the same failure the routes refuse to commit when they reject an unknown
 * field with a 400 rather than a silent no-op, and `fetchApi` is already written to read it.
 */
app.onError((err, c) => c.json({ error: err.message }, 500))

/**
 * A repeat read costs a 304, not the records again.
 *
 * These lists are re-fetched constantly — every navigation back to a list, every mutation that
 * invalidates one — and the overwhelming majority of those reads return exactly what the browser
 * already has. The ETag turns that into a couple of hundred bytes. It sits below the gate, so an
 * unauthenticated request is still a redirect and never a 304 that would hand a signed-out browser
 * its own cached records back.
 *
 * `revalidateReads` is outside `etag` so it can label the 304 as well as the 200 — see http-cache.ts.
 */
app.use("/api/crm/*", revalidateReads())
app.use("/api/crm/*", etag())

// Literal playbook paths are registered before the generic `/:object` CRM routes.
app.route("/api/crm", crmDocRoutes())
app.route("/api/crm", crmRoutes())

const isProduction = process.env.NODE_ENV === "production"

if (isProduction) {
  const { serveStatic } = await import("hono/bun")
  app.use("/*", serveStatic({ root: "./dist" }))

  /*
   * A missing build asset is a 404, never the index page.
   *
   * The catch-all below exists so a deep link like `/crm/deals/<id>` reaches the router instead of
   * the filesystem, and it happily answers `/assets/whatever.js` with `index.html` too. The browser
   * then reports `Failed to load module script: non-JavaScript MIME type "text/html"`, which reads
   * like a server misconfiguration and is really "that file is not in this build" — a stale tab
   * asking for last deploy's chunk, or a chunk the bundler never emitted. Both are worth seeing as
   * a 404 with the path in it.
   */
  app.get("/assets/*", c => c.text(`not found: ${c.req.path}`, 404))

  app.get("*", serveStatic({ path: "./dist/index.html" }))
}

const PORT = process.env.API_PORT || process.env.PORT || 4000

console.log(`${isProduction ? "Production" : "API"} server running on http://localhost:${PORT}`)

export default {
  port: PORT,
  fetch: app.fetch,
}
