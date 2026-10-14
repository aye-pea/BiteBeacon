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
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}');`);
  await db.exec(readFileSync('supabase/migrations/202609300001_profiles.sql', 'utf8'));
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
