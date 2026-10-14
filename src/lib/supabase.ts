import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && key);
// Browser sessions stay in memory; native refresh tokens use OS-backed SecureStore.
const memory = new Map<string, string>();
const storage = {
  getItem: async (name: string) => Platform.OS === 'web' ? memory.get(name) ?? null : SecureStore.getItemAsync(name),
  setItem: async (name: string, value: string) => { if (Platform.OS === 'web') memory.set(name, value); else await SecureStore.setItemAsync(name, value); },
  removeItem: async (name: string) => { if (Platform.OS === 'web') memory.delete(name); else await SecureStore.deleteItemAsync(name); },
};
export const supabase = cloudConfigured ? createClient(url!, key!, {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;
