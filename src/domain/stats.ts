// Shape of the admin dashboard's numbers, read defensively from the database's JSON.
export type AdminStats = {
  generatedAt: string; scans: number; accounts: number; profiles: number; members: number;
  signups7d: number; signups30d: number; active1d: number; active7d: number; active30d: number;
  signupsByDay: { day: string; count: number }[];
  recentSignIns: { email: string; createdAt: string; lastSignInAt: string | null }[];
  allergens: Record<string, number>; householdSizes: { size: number; accounts: number }[]; languages: Record<string, number>;
  pantry: { items: number; active: number; withExpiry: number; accounts: number };
};

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0;
const str = (v: unknown) => typeof v === 'string' ? v : '';
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const counts = (v: unknown) => Object.fromEntries(Object.entries(obj(v)).map(([k, n]) => [k, num(n)]));

// The database returns JSON; anything missing or malformed reads as zero rather than breaking the page.
export function parseAdminStats(raw: unknown): AdminStats {
  const r = obj(raw); const p = obj(r.pantry);
  return {
    generatedAt: str(r.generated_at), scans: num(r.scans), accounts: num(r.accounts), profiles: num(r.profiles), members: num(r.members),
    signups7d: num(r.signups_7d), signups30d: num(r.signups_30d), active1d: num(r.active_1d), active7d: num(r.active_7d), active30d: num(r.active_30d),
    signupsByDay: arr(r.signups_by_day).map(d => ({ day: str(obj(d).day).slice(0, 10), count: num(obj(d).count) })),
    recentSignIns: arr(r.recent_sign_ins).map(u => ({ email: str(obj(u).email), createdAt: str(obj(u).created_at), lastSignInAt: str(obj(u).last_sign_in_at) || null })),
    allergens: counts(r.allergens), languages: counts(r.languages),
    householdSizes: Object.entries(counts(r.household_sizes)).map(([size, accounts]) => ({ size: num(size), accounts })).sort((a, b) => a.size - b.size),
    pantry: { items: num(p.items), active: num(p.active), withExpiry: num(p.with_expiry), accounts: num(p.accounts) },
  };
}
