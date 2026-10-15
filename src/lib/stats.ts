import { AdminStats, parseAdminStats } from '../domain/stats';
import { supabase } from './supabase';

// Adds one to the app-wide lookup total. Nothing is sent but the call itself: no barcode, product or person.
// Fire and forget, so a slow or failed count never holds up a result.
export function recordScan() {
  if (!supabase) return;
  void Promise.resolve(supabase.rpc('record_scan')).catch(() => { /* counting is best effort */ });
}

export async function checkAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

export async function loadAdminStats(): Promise<AdminStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('admin_stats');
  return error ? null : parseAdminStats(data);
}
