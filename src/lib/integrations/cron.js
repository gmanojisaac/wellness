import 'server-only';
import { timingSafeEqual } from 'node:crypto';

// cron-job.org calls the /api/cron/* endpoints with the header
//   Authorization: Bearer <CRON_SECRET>
// Returns true only when the secret is set and matches.
export function isAuthorizedCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
