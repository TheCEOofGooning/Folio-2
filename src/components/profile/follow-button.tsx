"use client";

/**
 * Follow control.
 *
 * A thin island so the profile page itself can stay cached and viewer-agnostic.
 * The follower count is server-rendered; this only owns the button state and
 * adjusts the visible count optimistically.
 */
import { useState } from "react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { followAction } from "@/server/actions/social";
import { formatNumber } from "@/lib/utils";

export function FollowButton({
  username,
  displayName,
  initialFollowing = false,
  followerCount,
}: {
  username: string;
  displayName: string;
  initialFollowing?: boolean;
  followerCount: number;
}) {
  const { user, requireAuth } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(followerCount);
  const [pending, setPending] = useState(false);

  // An author doesn't follow themselves.
  if (user?.username === username) {
    return (
      <p className="text-[0.8125rem] text-ink-faint">
        {formatNumber(count)} {count === 1 ? "follower" : "followers"} · this is you
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={following ? "secondary" : "primary"}
        size="md"
        loading={pending}
        onClick={async () => {
          if (!requireAuth("follow")) return;
          const next = !following;
          setFollowing(next);
          setCount((value) => value + (next ? 1 : -1));
          setPending(true);
          const result = await followAction(username);
          setPending(false);
          if (result.ok && result.data) {
            setFollowing(result.data.following);
          } else {
            // Roll back if the write failed.
            setFollowing(!next);
            setCount((value) => value + (next ? -1 : 1));
          }
        }}
      >
        {following ? "Following" : `Follow ${displayName.split(" ")[0]}`}
      </Button>
      <span className="text-[0.8125rem] text-ink-faint">
        {formatNumber(count)} {count === 1 ? "follower" : "followers"}
      </span>
    </div>
  );
}
