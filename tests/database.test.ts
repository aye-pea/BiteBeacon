import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  // Supabase Auth fixtures; PostgreSQL RLS and migration execute in a real PG engine.
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text, created_at timestamptz not null default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}');`);
  await db.exec(readFileSync('supabase/migrations/202609300001_profiles.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610140001_household_members.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610140002_profile_language.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610150001_pantry_items.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610150002_more_languages.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610150004_default_view_people.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610150005_more_allergens.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610150006_admin_stats.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202610150009_admin_levels.sql', 'utf8'));
});
afterAll(async () => { await db?.close(); });
async function asUser(id: string) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}', false);`); }

describe('owner-only database boundary', () => {
  it('permits own insert and profile upsert', async () => {
    await asUser(A);
    await db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, array['milk'], '2026-09-30')`, [A]);
    await db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, array['peanuts'], '2026-09-30') on conflict(id) do update set id = excluded.id, allergies = excluded.allergies, consent_version = excluded.consent_version`, [A]);
    expect((await db.query<{ allergies: string[] }>('select allergies from public.profiles')).rows[0].allergies).toEqual(['peanuts']);
  });
  it('hides another user profile and blocks editing/deleting it', async () => {
    await asUser(B);
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0);
    expect((await db.query(`update public.profiles set allergies = array['milk'] where id = $1 returning id`, [A])).rows).toHaveLength(0);
    expect((await db.query('delete from public.profiles where id = $1 returning id', [A])).rows).toHaveLength(0);
    await expect(db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, array['milk'], '2026-09-30')`, [A])).rejects.toThrow(/row-level security/);
  });
  it('blocks unsupported, empty, and null allergy entries', async () => {
    await asUser(A);
    for (const value of ["array['banana']", 'array[]::text[]', 'array[null]::text[]']) {
      await expect(db.query(`update public.profiles set allergies = ${value} where id = $1`, [A])).rejects.toThrow(/supported_allergies/);
    }
  });
  it('blocks impersonation through changed id', async () => {
    await asUser(A);
    await expect(db.query('update public.profiles set id = $1 where id = $2', [B, A])).rejects.toThrow(/row-level security/);
  });
  it('blocks anonymous profile access and account deletion', async () => {
    await db.exec('reset role; set role anon;');
    await expect(db.query('select * from public.profiles')).rejects.toThrow(/permission denied/);
    await expect(db.query('select public.delete_my_account()')).rejects.toThrow(/permission denied/);
  });
  it('deletes only caller account and cascades its profile', async () => {
    await asUser(B);
    await db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, array['soy'], '2026-09-30')`, [B]);
    await db.query('select public.delete_my_account()');
    await db.exec('reset role;');
    expect((await db.query('select id from auth.users')).rows).toEqual([{ id: A }]);
    expect((await db.query('select id from public.profiles')).rows).toEqual([{ id: A }]);
  });
});

describe('household members', () => {
  const C = '33333333-3333-4333-8333-333333333333';
  const D = '44444444-4444-4444-8444-444444444444';
  beforeAll(async () => {
    await db.exec(`reset role; insert into auth.users values ('${C}'), ('${D}');`);
    await asUser(D);
    await db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, array['sesame'], '2026-09-30')`, [D]);
  });
  const add = (name: string, allergies = "array['milk']") => db.query<{ id: string; owner_id: string }>(`insert into public.household_members(name, allergies) values ($1, ${allergies}) returning id, owner_id`, [name]);
  it('stamps the owner from the caller and lists only their own members', async () => {
    await asUser(C);
    const kha = (await add('Kha')).rows[0];
    expect(kha.owner_id).toBe(C);
    await asUser(D);
    expect((await db.query('select * from public.household_members')).rows).toHaveLength(0);
    expect((await db.query(`update public.household_members set name = 'X' where id = $1 returning id`, [kha.id])).rows).toHaveLength(0);
    expect((await db.query('delete from public.household_members where id = $1 returning id', [kha.id])).rows).toHaveLength(0);
  });
  it('refuses a client-supplied owner', async () => {
    await asUser(D);
    await expect(db.query(`insert into public.household_members(owner_id, name, allergies) values ($1, 'Spoof', array['milk'])`, [C])).rejects.toThrow(/permission denied/);
  });
  it('validates names and allergies', async () => {
    await asUser(D);
    for (const [name, allergies] of [['  ', "array['milk']"], ['x'.repeat(41), "array['milk']"], ['Ok', "array['banana']"], ['Ok', 'array[]::text[]']]) {
      await expect(add(name, allergies)).rejects.toThrow(/check constraint/);
    }
  });
  it('caps a household at eight members', async () => {
    await asUser(D);
    for (let i = 0; i < 8; i++) await add(`Person ${i}`);
    await expect(add('Ninth')).rejects.toThrow(/household_limit/);
    await db.query(`delete from public.household_members where name like 'Person %' and name <> 'Person 0'`);
  });
  it('lets the default view point only at the caller own member, and clears it when that member is removed', async () => {
    await asUser(C);
    const other = (await db.query<{ id: string }>(`select id from public.household_members`)).rows[0].id;
    await asUser(D);
    const own = (await db.query<{ id: string }>(`select id from public.household_members`)).rows[0].id;
    await db.query('update public.profiles set default_member_id = $1, display_name = $2 where id = $3', [own, 'DFK', D]);
    await expect(db.query('update public.profiles set default_member_id = $1 where id = $2', [other, D])).rejects.toThrow(/default_member_owned/);
    await db.query('delete from public.household_members where id = $1', [own]);
    const row = (await db.query<{ default_member_id: string | null; display_name: string }>('select default_member_id, display_name from public.profiles where id = $1', [D])).rows[0];
    expect(row).toEqual({ default_member_id: null, display_name: 'DFK' });
  });
  it('lets the default view list any mix of the caller own members, and drops a member when removed', async () => {
    await asUser(C);
    const other = (await db.query<{ id: string }>(`select id from public.household_members`)).rows[0].id;
    await asUser(D);
    const [kha, dfk] = [(await add('Kha')).rows[0].id, (await add('DFK')).rows[0].id];
    await db.query('update public.profiles set default_include_me = false, default_member_ids = $1 where id = $2', [[kha, dfk], D]);
    await expect(db.query('update public.profiles set default_member_ids = $1 where id = $2', [[kha, other], D])).rejects.toThrow(/default_members_owned/);
    await db.query('delete from public.household_members where id = $1', [kha]);
    const row = (await db.query<{ default_include_me: boolean; default_member_ids: string[] }>('select default_include_me, default_member_ids from public.profiles where id = $1', [D])).rows[0];
    expect(row).toEqual({ default_include_me: false, default_member_ids: [dfk] });
  });
  it('deletes members with the account', async () => {
    await asUser(C);
    await db.query('select public.delete_my_account()');
    await db.exec('reset role;');
    expect((await db.query('select owner_id from public.household_members where owner_id = $1', [C])).rows).toHaveLength(0);
  });
  it('blocks anonymous access', async () => {
    await db.exec('reset role; set role anon;');
    await expect(db.query('select * from public.household_members')).rejects.toThrow(/permission denied/);
  });
});

describe('profile language', () => {
  const E = '55555555-5555-4555-8555-555555555555';
  it('saves a supported language for the owner only and rejects others', async () => {
    await db.exec(`reset role; insert into auth.users values ('${E}');`);
    await asUser(E);
    await db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, array['fish'], '2026-09-30')`, [E]);
    await db.query('update public.profiles set language = $1 where id = $2', ['vi', E]);
    expect((await db.query<{ language: string }>('select language from public.profiles where id = $1', [E])).rows[0].language).toBe('vi');
    await db.query('update public.profiles set language = $1 where id = $2', ['zh-Hant', E]);
    expect((await db.query<{ language: string }>('select language from public.profiles where id = $1', [E])).rows[0].language).toBe('zh-Hant');
    await expect(db.query('update public.profiles set language = $1 where id = $2', ['xx', E])).rejects.toThrow(/profile_language/);
    await db.query('update public.profiles set language = null where id = $1', [E]);
    await asUser(A);
    expect((await db.query(`update public.profiles set language = 'es' where id = $1 returning id`, [E])).rows).toHaveLength(0);
  });
});

describe('pantry items', () => {
  const F = '66666666-6666-4666-8666-666666666666';
  const G = '77777777-7777-4777-8777-777777777777';
  const product = JSON.stringify({ barcode: '00000000', name: 'Oats' });
  const add = (expires: string | null = '2026-10-20') => db.query<{ id: string; owner_id: string; status: string }>(`insert into public.pantry_items(product, expires_on) values ($1::jsonb, $2) returning id, owner_id, status`, [product, expires]);
  beforeAll(async () => { await db.exec(`reset role; insert into auth.users values ('${F}'), ('${G}');`); });
  it('stamps the owner, starts active and hides items from other users', async () => {
    await asUser(F);
    const row = (await add()).rows[0];
    expect([row.owner_id, row.status]).toEqual([F, 'active']);
    await asUser(G);
    expect((await db.query('select * from public.pantry_items')).rows).toHaveLength(0);
    expect((await db.query(`update public.pantry_items set status = 'consumed', closed_at = now() where id = $1 returning id`, [row.id])).rows).toHaveLength(0);
    expect((await db.query('delete from public.pantry_items where id = $1 returning id', [row.id])).rows).toHaveLength(0);
  });
  it('refuses a client-supplied owner and bad values', async () => {
    await asUser(G);
    await expect(db.query(`insert into public.pantry_items(owner_id, product) values ($1, $2::jsonb)`, [F, product])).rejects.toThrow(/permission denied/);
    await expect(db.query(`insert into public.pantry_items(product) values ('[]'::jsonb)`)).rejects.toThrow(/check constraint/);
    await expect(add('1990-01-01')).rejects.toThrow(/check constraint/);
    const id = (await add(null)).rows[0].id;
    await expect(db.query(`update public.pantry_items set status = 'eaten', closed_at = now() where id = $1`, [id])).rejects.toThrow(/check constraint/);
    await expect(db.query(`update public.pantry_items set status = 'consumed' where id = $1`, [id])).rejects.toThrow(/pantry_closed_matches_status/);
  });
  it('lets the owner mark used and put back', async () => {
    await asUser(F);
    const id = (await db.query<{ id: string }>('select id from public.pantry_items')).rows[0].id;
    await db.query(`update public.pantry_items set status = 'consumed', closed_at = now() where id = $1`, [id]);
    await db.query(`update public.pantry_items set status = 'active', closed_at = null where id = $1`, [id]);
    expect((await db.query<{ status: string }>('select status from public.pantry_items where id = $1', [id])).rows[0].status).toBe('active');
  });
  it('caps an account at 300 items', async () => {
    await asUser(G);
    await db.query(`insert into public.pantry_items(product) select $1::jsonb from generate_series(1, 299)`, [product]);
    await expect(add()).rejects.toThrow(/pantry_limit/);
  });
  it('deletes items with the account and blocks anonymous access', async () => {
    await asUser(G);
    await db.query('select public.delete_my_account()');
    await db.exec('reset role;');
    expect((await db.query('select id from public.pantry_items where owner_id = $1', [G])).rows).toHaveLength(0);
    await db.exec('set role anon;');
    await expect(db.query('select * from public.pantry_items')).rejects.toThrow(/permission denied/);
  });
});

describe('more allergens', () => {
  const H = '88888888-8888-4888-8888-888888888888';
  const all15 = "array['milk','eggs','peanuts','tree-nuts','soy','wheat','fish','shellfish','sesame','gluten','mollusks','mustard','celery','sulfites','lupin']";
  it('accepts all 15 allergens for profiles and household members, and still rejects unknown ones', async () => {
    await db.exec(`reset role; insert into auth.users values ('${H}');`);
    await asUser(H);
    await db.query(`insert into public.profiles(id, allergies, consent_version) values ($1, ${all15}, '2026-09-30')`, [H]);
    expect((await db.query<{ allergies: string[] }>('select allergies from public.profiles where id = $1', [H])).rows[0].allergies).toHaveLength(15);
    await db.query(`insert into public.household_members(name, allergies) values ('Sam', array['gluten','mollusks'])`);
    await expect(db.query(`update public.profiles set allergies = array['banana'] where id = $1`, [H])).rejects.toThrow(/supported_allergies/);
    await expect(db.query(`insert into public.household_members(name, allergies) values ('Kim', array['kiwi'])`)).rejects.toThrow(/member_supported_allergies/);
  });
});

describe('scan total and admin statistics', () => {
  const ADMIN = '99999999-9999-4999-8999-999999999999';
  const scans = async () => { await db.exec('reset role;'); return Number((await db.query<{ total: string }>('select total from public.scan_total')).rows[0].total); };
  it('lets anyone add to the scan total but not read or change it directly', async () => {
    const before = await scans();
    await db.exec('reset role; set role anon;');
    await db.query('select public.record_scan()');
    await expect(db.query('select * from public.scan_total')).rejects.toThrow(/permission denied/);
    await expect(db.query('update public.scan_total set total = 0')).rejects.toThrow(/permission denied/);
    await asUser(A);
    await db.query('select public.record_scan()');
    await expect(db.query('select * from public.scan_total')).rejects.toThrow(/permission denied/);
    expect(await scans()).toBe(before + 2);
  });
  it('keeps the admin list out of reach of app accounts', async () => {
    await asUser(A);
    await expect(db.query('insert into public.admins(user_id) values ($1)', [A])).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from public.admins')).rejects.toThrow(/permission denied/);
    expect((await db.query<{ is_admin: boolean }>('select public.is_admin()')).rows[0].is_admin).toBe(false);
    await expect(db.query('select public.admin_stats()')).rejects.toThrow(/admin_only/);
    await db.exec('reset role; set role anon;');
    await expect(db.query('select public.admin_stats()')).rejects.toThrow(/permission denied/);
    await expect(db.query('select public.is_admin()')).rejects.toThrow(/permission denied/);
  });
  it('gives an admin totals across every account', async () => {
    await db.exec(`reset role; insert into auth.users(id, email, last_sign_in_at) values ('${ADMIN}', 'owner@example.com', now()); insert into public.admins(user_id) values ('${ADMIN}');`);
    await asUser(ADMIN);
    expect((await db.query<{ is_admin: boolean }>('select public.is_admin()')).rows[0].is_admin).toBe(true);
    const stats = (await db.query<{ s: Record<string, any> }>('select public.admin_stats() as s')).rows[0].s;
    await db.exec('reset role;');
    const count = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);
    expect(stats.accounts).toBe(await count('select count(*) as n from auth.users'));
    expect(stats.profiles).toBe(await count('select count(*) as n from public.profiles'));
    expect(stats.members).toBe(await count('select count(*) as n from public.household_members'));
    expect(stats.scans).toBe(await scans());
    expect(stats.active_1d).toBe(1);
    expect(stats.signups_by_day).toHaveLength(30);
    expect(stats.signups_by_day.at(-1).count).toBe(stats.accounts);
    expect(stats.recent_sign_ins[0].email).toBe('owner@example.com');
    expect(stats.allergens.gluten).toBe(2);
    expect(Object.values(stats.household_sizes as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(stats.profiles);
    expect(stats.pantry.items).toBe(await count('select count(*) as n from public.pantry_items'));
  });
  it('gives a limited admin only scans, accounts, activity, sign-ups and recent sign-ins', async () => {
    const LIMITED = '77777777-aaaa-4777-8777-777777777777';
    await db.exec(`reset role; insert into auth.users(id, email) values ('${LIMITED}', 'limited@example.com'); insert into public.admins(user_id, full_access) values ('${LIMITED}', false);`);
    await asUser(LIMITED);
    const stats = (await db.query<{ s: Record<string, any> }>('select public.admin_stats() as s')).rows[0].s;
    expect(stats.full).toBe(false);
    expect(Object.keys(stats).sort()).toEqual(['accounts', 'active_1d', 'active_30d', 'active_7d', 'full', 'generated_at', 'recent_sign_ins', 'scans', 'signups_30d', 'signups_7d', 'signups_by_day']);
    await asUser('99999999-9999-4999-8999-999999999999');
    const full = (await db.query<{ s: Record<string, any> }>('select public.admin_stats() as s')).rows[0].s;
    expect(full.full).toBe(true);
    expect(full.pantry).toBeDefined();
    await db.exec('reset role;');
  });
});
