import "@fontsource-variable/inter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
  redirect,
} from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import { CrmLayout } from "#/components/crm/CrmLayout.tsx"
import { Toaster } from "#/components/ui/sonner.tsx"
import { TooltipProvider } from "#/components/ui/tooltip.tsx"
import { ApiError } from "#/lib/api.ts"
import Emails from "./pages/crm/Emails"
import ObjectList from "./pages/crm/ObjectList"
import Overview from "./pages/crm/Overview"
import Personas from "./pages/crm/Personas"
import Pipeline from "./pages/crm/Pipeline"
import RecordDetail from "./pages/crm/RecordDetail"
import Research from "./pages/crm/Research"
import Tasks from "./pages/crm/Tasks"
import NotFound from "./pages/NotFound"
import "./index.css"

/**
 * How long a CRM read stays good, and when asking again is worth anything.
 *
 * Every list was `staleTime: 0`, which means a refetch on every mount: opening a company from the
 * list and pressing back re-fetched the whole company list, and it will re-fetch all 300,000 later. A
 * minute is the compromise — long enough that moving around the app costs nothing, short enough that
 * a change somebody made while you were on another screen shows up without a reload. The reads that
 * describe structure rather than records (the attribute catalog, the market cases, the personas) set
 * their own longer times in `use-crm.ts` and still override this.
 *
 * The safety net under it is the ETag: when a query does go stale and refetch, an unchanged list
 * answers 304 with no body. So the cost of being wrong about this number is a round trip, never a
 * stale screen.
 */
const ONE_MINUTE = 60 * 1000

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: ONE_MINUTE,

      // Keep a list in memory for the length of a working session rather than the default five
      // minutes, so going back to one is instant instead of a spinner over data we just had.
      gcTime: 30 * ONE_MINUTE,

      /*
       * Retry a server that fell over, never a request the server refused.
       *
       * A 4xx is an answer: an unknown field, a read-only column, an expired session that `fetchApi`
       * has already redirected on. Repeating it three times just delays the message and, for the 401,
       * fires three more requests at a tab that is already navigating away.
       */
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})

const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <Toaster />
        <Outlet />
      </TooltipProvider>
    </QueryClientProvider>
  ),
  notFoundComponent: NotFound,
})

/**
 * The front door is the CRM.
 *
 * `/` redirects rather than mounting the CRM at the root, so every `/crm/...` link, bookmark and
 * `$object` param keeps working unchanged — and a genuinely unknown path still reaches NotFound
 * instead of being swallowed by a root-level `$object` route.
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/crm" })
  },
})

/**
 * `/crm` is a layout route: it owns the sidebar and renders its children into `CrmLayout`'s outlet,
 * so the nav mounts once and survives navigation between record lists instead of remounting per page.
 *
 * `tasks` is declared before `$object` for readability only — TanStack Router ranks a static segment
 * above a dynamic one regardless of order, so `/crm/tasks` can never be read as an object named "tasks".
 */
const crmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/crm",
  component: CrmLayout,
})

const crmOverviewRoute = createRoute({ getParentRoute: () => crmRoute, path: "/", component: Overview })
/**
 * The map is the one route that is code-split.
 *
 * MapLibre is roughly 800kB of WebGL renderer, and bundling it with everything else made the Overview
 * page pay for a library it never touches. `lazyRouteComponent` puts it in its own chunk, fetched the
 * first time somebody opens the map. Nothing else here is big enough to be worth splitting.
 */
const crmMapRoute = createRoute({
  getParentRoute: () => crmRoute,
  path: "map",
  component: lazyRouteComponent(() => import("./pages/crm/Map")),
})
const crmPersonasRoute = createRoute({ getParentRoute: () => crmRoute, path: "personas", component: Personas })
const crmPipelineRoute = createRoute({ getParentRoute: () => crmRoute, path: "pipeline", component: Pipeline })
const crmTasksRoute = createRoute({ getParentRoute: () => crmRoute, path: "tasks", component: Tasks })
const crmEmailsRoute = createRoute({ getParentRoute: () => crmRoute, path: "emails", component: Emails })
const crmResearchRoute = createRoute({ getParentRoute: () => crmRoute, path: "research", component: Research })
const crmObjectRoute = createRoute({ getParentRoute: () => crmRoute, path: "$object", component: ObjectList })
const crmRecordRoute = createRoute({ getParentRoute: () => crmRoute, path: "$object/$id", component: RecordDetail })

const routeTree = rootRoute.addChildren([
  indexRoute,
  crmRoute.addChildren([
    crmOverviewRoute,
    crmEmailsRoute,
    crmMapRoute,
    crmPersonasRoute,
    crmPipelineRoute,
    crmResearchRoute,
    crmTasksRoute,
    crmObjectRoute,
    crmRecordRoute,
  ]),
])

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(<RouterProvider router={router} />)
