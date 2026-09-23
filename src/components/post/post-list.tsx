import { PostCard } from "./post-card";
import { cn } from "@/lib/utils";
import type { PostCard as PostCardData } from "@/db/types";

/** Shared list renderer so every surface spaces and divides stories identically. */
export function PostList({
  posts,
  variant = "card",
  className,
  emptyState,
  priorityCount = 0,
}: {
  posts: PostCardData[];
  variant?: "feature" | "card" | "row";
  className?: string;
  emptyState?: React.ReactNode;
  /** How many leading cards should load eagerly (above the fold). */
  priorityCount?: number;
}) {
  if (posts.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  if (variant === "row") {
    return (
      <div className={cn("divide-y divide-line", className)}>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} variant="row" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} variant={variant} priority={index < priorityCount} />
      ))}
    </div>
  );
}
