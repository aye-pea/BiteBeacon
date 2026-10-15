import { cleanUsername, usernameEmail } from '../domain/usernames';
import { supabase } from './supabase';

// The address to sign in with. An email is used as typed. A username is looked up by the database, which returns the
// account's current email only for the right password; before that lookup exists (or for a wrong password) the
// username's own placeholder address is tried, and Supabase rejects it if anything is wrong.
export async function signInAddress(login: string, password: string): Promise<string> {
  const typed = login.trim();
  if (typed.includes('@')) return typed;
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('username_sign_in_email', { p_username: cleanUsername(typed), p_password: password });
      if (!error && typeof data === 'string' && data) return data;
    } catch { /* fall back to the placeholder address */ }
  }
  return usernameEmail(typed);
}

export async function loadUsername(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('usernames').select('username').maybeSingle();
  return !error && typeof data?.username === 'string' ? data.username : null;
}

// Supabase answers a taken username either as an existing address or as the database refusing the name.
export const usernameTaken = (error: { code?: string; message?: string }) =>
  ['user_already_exists', 'email_exists'].includes(error.code ?? '') || /already registered|database error saving new user/i.test(error.message ?? '');
