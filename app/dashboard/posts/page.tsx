import { PostManager } from '@/components/post-manager';
import { FileIcon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { listCreatorPosts } from '@/lib/db/queries/posts';

export default async function DashboardPostsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const posts = await listCreatorPosts(user.id);

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<FileIcon size={26} />}
        title="No stories yet"
        description="Everything you write lands here — drafts included, visible only to you."
        action={<ButtonLink href="/write">Write your first story</ButtonLink>}
      />
    );
  }

  return <PostManager posts={posts} />;
}
