import { describe, expect, it } from 'vitest';
import { parseAdminStats } from '../src/domain/stats';

describe('admin statistics', () => {
  it('reads the database JSON, including numbers sent as text', () => {
    const s = parseAdminStats({ scans: '1204', accounts: 7, signups_by_day: [{ day: '2026-10-15', count: 2 }], household_sizes: { 3: 1, 1: 4 },
      allergens: { peanuts: 3 }, languages: { device: 5, es: 2 }, pantry: { items: 9, active: 6, with_expiry: 5, accounts: 2 },
      recent_sign_ins: [{ email: 'a@example.com', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: null }] });
    expect(s.scans).toBe(1204);
    expect(s.householdSizes).toEqual([{ size: 1, accounts: 4 }, { size: 3, accounts: 1 }]);
    expect(s.pantry.withExpiry).toBe(5);
    expect(s.recentSignIns[0].lastSignInAt).toBeNull();
  });
  it('treats missing or malformed values as zero or empty', () => {
    const s = parseAdminStats({ scans: 'lots', signups_by_day: 'x', allergens: [1, 2] });
    expect(s.scans).toBe(0);
    expect(s.accounts).toBe(0);
    expect(s.signupsByDay).toEqual([]);
    expect(s.allergens).toEqual({});
    expect(parseAdminStats(null).pantry.items).toBe(0);
  });
  it('treats stats as full unless the database says the admin is limited', () => {
    expect(parseAdminStats({}).full).toBe(true);
    expect(parseAdminStats({ full: true }).full).toBe(true);
    expect(parseAdminStats({ full: false }).full).toBe(false);
  });
});
