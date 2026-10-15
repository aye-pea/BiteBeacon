import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isUsername, usernameEmail, usernameFromEmail } from '../src/domain/usernames';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
const PASSWORD = 'correct horse battery';
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  // Supabase Auth fixtures: auth.users with a bcrypt password, as Supabase stores it.
  await db.exec(`create role anon; create role authenticated;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create table auth.users(id uuid primary key, email text unique, encrypted_password text,
      created_at timestamptz not null default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  await db.exec(readFileSync('supabase/migrations/202610150007_usernames.sql', 'utf8'));
  const add = (id: string, email: string) => db.query(`insert into auth.users(id, email, encrypted_password)
    values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')))`, [id, email, PASSWORD]);
  await add(A, 'alex@users.bitebeacon.org');
  await add(B, 'someone@example.com');
});
afterAll(async () => { await db?.close(); });
async function as(role: 'anon' | 'authenticated', id = '') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}', false);`); }
const lookup = (name: string, password: string) => db.query<{ email: string | null }>('select public.username_sign_in_email($1, $2) as email', [name, password]).then(r => r.rows[0].email);

describe('usernames', () => {
  it('claims the username of a username account, and only those', async () => {
    await db.exec('reset role;');
    expect((await db.query('select user_id, username from public.usernames')).rows).toEqual([{ user_id: A, username: 'alex' }]);
  });
  it('refuses a username that is already held, even after its owner switched to a real email', async () => {
    await db.exec(`reset role; update auth.users set email = 'alex.real@example.com' where id = '${A}';`);
    await expect(db.query(`insert into auth.users(id, email) values ($1, 'alex@users.bitebeacon.org')`, [C])).rejects.toThrow(/unique/);
    await expect(db.query(`insert into auth.users(id, email) values ($1, 'No Spaces!@users.bitebeacon.org')`, [C])).rejects.toThrow(/check/);
  });
  it('returns the current email only for the right password', async () => {
    await as('anon');
    expect(await lookup('Alex ', PASSWORD)).toBe('alex.real@example.com');
    expect(await lookup('alex', 'wrong password')).toBeNull();
    expect(await lookup('nobody', PASSWORD)).toBeNull();
  });
  it('stops answering after 10 wrong passwords in 15 minutes', async () => {
    await as('anon');
    for (let i = 0; i < 10; i++) await lookup('alex', `guess ${i}`);
    expect(await lookup('alex', PASSWORD)).toBeNull();
    await db.exec(`reset role; update public.username_sign_in_failures set failed_at = now() - interval '16 minutes';`);
    await as('anon');
    expect(await lookup('alex', PASSWORD)).toBe('alex.real@example.com');
  });
  it('lets people read only their own username, and nobody read the failure log', async () => {
    await as('anon');
    await expect(db.query('select * from public.usernames')).rejects.toThrow(/permission denied/);
    await as('authenticated', B);
    expect((await db.query('select * from public.usernames')).rows).toHaveLength(0);
    await expect(db.query('select * from public.username_sign_in_failures')).rejects.toThrow(/permission denied/);
    await expect(db.query(`insert into public.usernames(user_id, username) values ($1, 'grab')`, [B])).rejects.toThrow(/permission denied/);
    await as('authenticated', A);
    expect((await db.query('select username from public.usernames')).rows).toEqual([{ username: 'alex' }]);
  });
  it('drops the username with the account', async () => {
    await db.exec(`reset role; delete from auth.users where id = '${A}';`);
    expect((await db.query('select * from public.usernames')).rows).toHaveLength(0);
  });
});

describe('username helpers', () => {
  it('accepts 3 to 20 lowercase letters, numbers or underscores', () => {
    for (const ok of ['abc', 'alex_p', 'a1b2c3', 'x'.repeat(20)]) expect(isUsername(ok)).toBe(true);
    for (const bad of ['ab', 'x'.repeat(21), 'Alex', 'al ex', 'al.ex', 'alex@x', '']) expect(isUsername(bad)).toBe(false);
  });
  it('maps a username to its sign-in address and back', () => {
    expect(usernameEmail('alex_p')).toBe('alex_p@users.bitebeacon.org');
    expect(usernameFromEmail('alex_p@users.bitebeacon.org')).toBe('alex_p');
    expect(usernameFromEmail('ALEX@Users.BiteBeacon.org')).toBe('alex');
    expect(usernameFromEmail('alex@example.com')).toBeNull();
    expect(usernameFromEmail(undefined)).toBeNull();
  });
});
