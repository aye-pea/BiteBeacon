import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Show or hide Home in the tab bar and sidebar, from Settings. Kept on this device only, like Appearance:
// localStorage on the web (falls back to memory when blocked), SecureStore on native. Home shows by default.
const SHOW_HOME_KEY = 'bitebeacon.showHome';
const web = Platform.OS === 'web';
let showHome = true;
const listeners = new Set<() => void>();
const parse = (v: string | null) => v === 'false' ? false : v === 'true' ? true : null;
if (web) { try { const v = parse(localStorage.getItem(SHOW_HOME_KEY)); if (v !== null) showHome = v; } catch { /* storage blocked */ } }
else SecureStore.getItemAsync(SHOW_HOME_KEY).then(v => { const p = parse(v); if (p !== null && p !== showHome) { showHome = p; listeners.forEach(l => l()); } }, () => {});
export function setShowHome(next: boolean) {
  showHome = next; listeners.forEach(l => l());
  if (web) { try { localStorage.setItem(SHOW_HOME_KEY, String(next)); } catch { /* applies until reload */ } }
  else SecureStore.setItemAsync(SHOW_HOME_KEY, String(next)).catch(() => {});
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useShowHome(): boolean { return useSyncExternalStore(subscribe, () => showHome, () => showHome); }
