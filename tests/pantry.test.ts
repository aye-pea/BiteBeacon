import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../src/data/products';
import { activePantry, addDays, closedPantry, daysUntil, expiryState, PantryItem, pantryAlerts, validDay } from '../src/domain/pantry';

const item = (id: string, expiresOn: string | null, extra: Partial<PantryItem> = {}): PantryItem =>
  ({ id, product: SAMPLES[0], expiresOn, status: 'active', addedAt: '2026-10-01T00:00:00Z', closedAt: null, ...extra });
const today = '2026-10-14';

describe('pantry expiry', () => {
  it('validates real calendar days only', () => {
    expect(validDay('2026-10-14')).toBe(true);
    expect(validDay('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '14/10/2026', '2026-1-4', '', '1999-01-01']) expect(validDay(bad), bad).toBe(false);
  });
  it('counts whole days across months and DST changes', () => {
    expect(daysUntil('2026-10-15', today)).toBe(1);
    expect(daysUntil('2026-10-10', today)).toBe(-4);
    expect(daysUntil('2026-11-02', '2026-10-31')).toBe(2);
    expect(daysUntil('2027-03-15', '2027-03-13')).toBe(2);
    expect(addDays('2026-10-30', 7)).toBe('2026-11-06');
  });
  it('labels expired, today, soon, later and undated items', () => {
    expect(['2026-10-13', today, '2026-10-17', '2026-10-18', null].map(d => expiryState({ expiresOn: d }, today))).toEqual(['expired', 'today', 'soon', 'later', 'none']);
  });
  it('lists active items most urgent first and keeps used ones out', () => {
    const items = [item('later', '2026-12-01'), item('none', null), item('used', '2026-10-01', { status: 'consumed', closedAt: '2026-10-02T00:00:00Z' }), item('expired', '2026-10-01'), item('soon', '2026-10-16')];
    expect(activePantry(items, today).map(i => i.id)).toEqual(['expired', 'soon', 'later', 'none']);
    expect(closedPantry(items).map(i => i.id)).toEqual(['used']);
    expect(pantryAlerts(items, today)).toEqual({ expired: 1, today: 0, soon: 1 });
  });
});
