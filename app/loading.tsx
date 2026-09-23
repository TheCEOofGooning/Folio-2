import { PostCardSkeleton, Skeleton } from '@/components/ui/card';

/** Streamed immediately while the route resolves — keeps navigation instant. */
export default function Loading() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-56 rounded-xl" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <PostCardSkeleton key={index} />
        ))}
      </div>
      <div className="hidden lg:block">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}
