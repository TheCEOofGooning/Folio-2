import { getCurrentUser } from '@/lib/auth/session';
import { json } from '@/lib/utils/api';

export const dynamic = 'force-dynamic';

/**
 * The one endpoint the static header needs. Returns just enough to render the
 * avatar menu — never the email or password hash.
 */
export async function GET() {
  const user = await getCurrentUser();
  return json({ user });
}
