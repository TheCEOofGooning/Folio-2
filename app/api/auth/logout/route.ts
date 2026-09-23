import { destroyCurrentSession } from '@/lib/auth/session';
import { json } from '@/lib/utils/api';

export const dynamic = 'force-dynamic';

export async function POST() {
  await destroyCurrentSession();
  return json({ ok: true });
}
