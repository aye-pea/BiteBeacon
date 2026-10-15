import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && key);
const web = Platform.OS === 'web';

// Browser: "Stay signed in" keeps the session in localStorage so a reload keeps you signed in; off, it stays in memory
// and ends with the tab (for shared computers). Native refresh tokens always use OS-backed SecureStore.
// localStorage can be missing or throw (private mode, blocked storage); every use falls back to memory.
const REMEMBER = 'bitebeacon.stay-signed-in';
const local = (): Storage | null => { try { return web && typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
export function staySignedIn(): boolean { try { return local()?.getItem(REMEMBER) !== 'no'; } catch { return false; } }
export function setStaySignedIn(on: boolean) {
  try {
    const l = local(); if (!l) return;
    l.setItem(REMEMBER, on ? 'yes' : 'no');
    if (!on) Object.keys(l).filter(k => k.startsWith('sb-')).forEach(k => l.removeItem(k));
  } catch { /* storage blocked: the session simply stays in memory */ }
}
const memory = new Map<string, string>();
const storage = {
  getItem: async (name: string) => {
    if (!web) return SecureStore.getItemAsync(name);
    try { return memory.get(name) ?? (staySignedIn() ? local()?.getItem(name) ?? null : null); } catch { return memory.get(name) ?? null; }
  },
  setItem: async (name: string, value: string) => {
    if (!web) { await SecureStore.setItemAsync(name, value); return; }
    memory.set(name, value);
    try { if (staySignedIn()) local()?.setItem(name, value); else local()?.removeItem(name); } catch { /* memory only */ }
  },
  removeItem: async (name: string) => {
    if (!web) { await SecureStore.deleteItemAsync(name); return; }
    memory.delete(name);
    try { local()?.removeItem(name); } catch { /* nothing stored */ }
  },
};
export const supabase = cloudConfigured ? createClient(url!, key!, {
  // On the web, the sign-up confirmation link lands back on the site with a session; picking it up signs the person in.
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: web },
}) : null;
