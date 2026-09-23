import { Skeleton } from "@/components/ui/misc";

/**
 * Explore loading state.
 *
 * Scoped deliberately. A `loading.tsx` at the **root** of the app was removed
 * because it wraps every route in a Suspense boundary, which makes Next flush the
 * HTML shell before the page has finished rendering — and once the shell is
 * flushed the status code is fixed at 200. The visible consequence was soft 404s
 * (`/p/unknown` returning 200 with a not-found body) and soft redirects
 * (`/dashboard` returning 200 instead of a 307 to the login page). That is an SEO
 * and correctness bug traded for a skeleton nobody needs on a static page.
 *
 * Here it is safe: `/explore` never redirects and never 404s, and it renders on
 * demand, so the skeleton genuinely covers database latency.
 */
export default function ExploreLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-5 h-12 w-full max-w-lg" />
      <Skeleton className="mt-4 h-4 w-full max-w-md" />

      <div className="mt-10 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-4">
            <Skeleton className="aspect-[16/10] w-full rounded-lg" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
