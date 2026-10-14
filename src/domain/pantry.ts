import type { Product } from './allergens';

// Pantry: products the user chose to keep after a scan, with an expiry date they typed from the package.
// Dates are calendar days (YYYY-MM-DD) in the user's own time zone, never instants, so "expires today" means today where they are.
export type PantryStatus = 'active' | 'consumed' | 'discarded';
export type PantryItem = { id: string; product: Product; expiresOn: string | null; status: PantryStatus; addedAt: string; closedAt: string | null };
export type ExpiryState = 'expired' | 'today' | 'soon' | 'later' | 'none';
export const SOON_DAYS = 3;
export const MAX_PANTRY = 300;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + n));
}
/** Accepts YYYY-MM-DD only, and only real calendar days (no 2026-02-30). */
export function validDay(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return y >= 2000 && y <= 2100 && date.getMonth() === mo - 1 && date.getDate() === d;
}
/** Whole days from today to the expiry day; negative once it has passed. UTC arithmetic keeps DST from shifting the count. */
export function daysUntil(expiresOn: string, today: string) {
  const utc = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(expiresOn) - utc(today)) / 86400000);
}
export function expiryState(item: Pick<PantryItem, 'expiresOn'>, today: string): ExpiryState {
  if (!item.expiresOn) return 'none';
  const days = daysUntil(item.expiresOn, today);
  return days < 0 ? 'expired' : days === 0 ? 'today' : days <= SOON_DAYS ? 'soon' : 'later';
}
const RANK: Record<ExpiryState, number> = { expired: 0, today: 1, soon: 2, later: 3, none: 4 };
/** Active items, most urgent first; same urgency by date, then most recently added. */
export function activePantry(items: PantryItem[], today: string) {
  return items.filter(i => i.status === 'active').sort((a, b) =>
    RANK[expiryState(a, today)] - RANK[expiryState(b, today)] || (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '') || b.addedAt.localeCompare(a.addedAt));
}
/** Used and thrown-out items, newest first: the pantry's history. */
export const closedPantry = (items: PantryItem[]) => items.filter(i => i.status !== 'active').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
/** What needs attention now: counts for the overview alert and tab badge. */
export function pantryAlerts(items: PantryItem[], today: string) {
  const states = items.filter(i => i.status === 'active').map(i => expiryState(i, today));
  return { expired: states.filter(s => s === 'expired').length, today: states.filter(s => s === 'today').length, soon: states.filter(s => s === 'soon').length };
}
