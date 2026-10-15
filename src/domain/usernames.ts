// Username accounts sign in to Supabase with this placeholder address, which never receives mail.
// The database claims the username from it (supabase/migrations/202610150007_usernames.sql).
export const USERNAME_DOMAIN = 'users.bitebeacon.org';

export const cleanUsername = (value: string) => value.trim().toLowerCase();
export const isUsername = (value: string) => /^[a-z0-9_]{3,20}$/.test(value);
export const usernameEmail = (username: string) => `${cleanUsername(username)}@${USERNAME_DOMAIN}`;
export function usernameFromEmail(email: string | null | undefined): string | null {
  const [name, domain] = (email ?? '').toLowerCase().split('@');
  return domain === USERNAME_DOMAIN && name ? name : null;
}
// Loose check before sending an address to Supabase, which does its own validation.
export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
