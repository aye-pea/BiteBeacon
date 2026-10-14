import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowUpRight, BookOpen, Camera, ChevronRight, CircleAlert, CircleQuestionMark, Clock3, Info, Leaf, LockKeyhole, LogOut, Pencil, Plus, RotateCcw, ScanBarcode, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TriangleAlert, UserRound, X } from 'lucide-react-native';
import type { Session } from '@supabase/supabase-js';
import { ALLERGENS, AllergenId, assess, Assessment, assessPeople, cleanName, Evidence, highlightIngredients, householdSummary, MAX_MEMBERS, Person, PersonResult, Product, unionAllergies, validBarcode, validName, worstKind } from './src/domain/allergens';
import { lookupProduct, SAMPLES } from './src/data/products';
import { cloudConfigured, supabase } from './src/lib/supabase';
import { bothSchemes, C, Palette, themes, Tone, type, useScheme } from './src/ui/theme';
import { haptic } from './src/ui/haptics';
import { Button, CheckMark, Notice, Reveal, Skeleton, Tap, ToastProvider, useToast } from './src/ui/controls';

type Page = 'overview' | 'scan' | 'allergies' | 'history' | 'settings' | 'about';
// 'me' is the account holder (allergies in profiles); other ids are household members.
const ME = 'me', EVERYONE = 'everyone';
const DEMO_HOUSEHOLD: Person[] = [{ id: 'demo-kha', name: 'Kha', allergies: ['milk', 'eggs'] }, { id: 'demo-dfk', name: 'DFK', allergies: ['sesame'] }];
type Entry = { product: Product; at: string };
const Icon = ({ name, size = 21, color = C.muted }: { name: Page; size?: number; color?: string }) => {
  const Component = { overview: Leaf, scan: ScanBarcode, allergies: SlidersHorizontal, history: Clock3, settings: Settings, about: BookOpen }[name];
  return <Component accessible={false} size={size} color={color} strokeWidth={1.9} />;
};
// "No match" is deliberately informational blue with a neutral haptic, never a green check or success buzz: it is not a safety verdict.
const RESULT: Record<Assessment['kind'], { tone: Tone; Icon: typeof Info; haptic: 'error' | 'warning' | 'tap' }> = {
  contains: { tone: 'danger', Icon: CircleAlert, haptic: 'error' }, traces: { tone: 'warning', Icon: TriangleAlert, haptic: 'warning' },
  unknown: { tone: 'warning', Icon: CircleQuestionMark, haptic: 'warning' }, 'no-match': { tone: 'info', Icon: Info, haptic: 'tap' },
};
// The hero keeps its deep green in both appearances, so its lime button keeps dark ink.
const HERO_INK = '#17332B';
const SAMPLE_ART = [{ bg: '#EDE5D2', pack: '#B38B58', word: 'CRUNCH' }, { bg: '#ECE0DA', pack: '#6E4F43', word: 'COCOA' }, { bg: '#E4EBCD', pack: '#84965A', word: 'OATS' }, { bg: '#E7E9E3', pack: '#9DA597', word: '?' }];
const allergyLabel = (id: AllergenId) => ALLERGENS.find(a => a.id === id)?.label;
const reportedTags = (tags: string[]) => tags.map(tag => tag.trim().replace(/^[a-z]{2}:/i, '').replace(/-/g, ' ').toUpperCase()).join(', ');
const evidenceText = (e: Evidence) => e.via === 'ingredient' ? `"${e.term}" appears in the ingredients` : `The source lists "${e.term}" as ${e.via === 'tag' ? 'an allergen' : 'a possible trace'}`;
const personReason = ({ assessment: a, evidence }: PersonResult) => evidence.length ? `${evidence.map(evidenceText).join('; ')}.` : a.kind === 'no-match' ? 'Not a safe-to-eat guarantee. Cross-contact is unknown; check the package.' : a.detail;
const toPerson = (row: { id: unknown; name: unknown; allergies: unknown }): Person | null => typeof row.id === 'string' && typeof row.name === 'string' && Array.isArray(row.allergies)
  ? { id: row.id, name: row.name, allergies: ALLERGENS.map(a => a.id).filter(id => (row.allergies as unknown[]).includes(id)) } : null;
const sourceName = (p: Product) => p.source === 'sample' ? 'Fictional sample' : p.source === 'usda' ? 'USDA FoodData Central' : 'Open Food Facts';
function barcodeHint(value: string): { text: string; ok: boolean } {
  const digits = value.trim();
  if (!digits) return { text: 'Printed under the barcode lines: 8, 12, 13 or 14 digits.', ok: false };
  if (!/^\d+$/.test(digits)) return { text: 'Numbers only, please.', ok: false };
  if (![8, 12, 13, 14].includes(digits.length)) return { text: `${digits.length} digits entered`, ok: false };
  return validBarcode(digits) ? { text: `${digits.length} digits · check digit matches`, ok: true } : { text: `${digits.length} digits · check digit does not match. Recheck the numbers.`, ok: false };
}

function AppContent() {
  const { width, fontScale } = useWindowDimensions();
  const scheme = useScheme(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  const toast = useToast();
  const wide = width >= 980 && fontScale < 1.5;
  const singleColumn = width < 600 || fontScale >= 1.5;
  const [page, setPage] = useState<Page>('overview');
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(cloudConfigured);
  const [profileReady, setProfileReady] = useState(false);
  const [allergies, setAllergies] = useState<AllergenId[]>([]);
  const [draft, setDraft] = useState<AllergenId[]>([]);
  const [history, setHistory] = useState<Entry[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [barcode, setBarcode] = useState('');
  const [barcodeFocused, setBarcodeFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackTone, setFeedbackTone] = useState<Tone>('warning');
  const [camera, setCamera] = useState(false);
  const [cameraAsking, setCameraAsking] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const generation = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const pendingScroll = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [myName, setMyName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [members, setMembers] = useState<Person[]>([]);
  const [defaultView, setDefaultView] = useState(ME);
  const [view, setView] = useState(ME);
  const [editing, setEditing] = useState<{ id: string | null; name: string; allergies: AllergenId[] } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const resetHousehold = () => { setMyName(''); setNameDraft(''); setMembers([]); setDefaultView(ME); setView(ME); setEditing(null); setRemoving(null); };
  const say = (message: string, kind: Tone = 'warning') => { setFeedback(message); setFeedbackTone(kind); };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => { if (error) say('Session could not be restored. Please sign in.'); setSession(data.session); setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setBooting(false); });
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') supabase?.auth.startAutoRefresh();
      else { supabase?.auth.stopAutoRefresh(); setCamera(false); }
    });
    return () => { listener.subscription.unsubscribe(); app.remove(); };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    setHistory([]); setProduct(null); setCamera(false); setProfileReady(false); setAllergies([]); setDraft([]); resetHousehold();
    if (!session || !supabase || demo) return;
    Promise.all([
      supabase.from('profiles').select('allergies, display_name, default_everyone, default_member_id').eq('id', session.user.id).maybeSingle(),
      supabase.from('household_members').select('id, name, allergies').order('position').order('created_at'),
    ]).then(([{ data, error }, household]) => {
      if (generation.current !== current) return;
      if (error || household.error) { haptic.error(); say('Could not load your allergy profile. Sign out and retry; scanning remains locked.', 'danger'); return; }
      const selected = Array.isArray(data?.allergies) ? data.allergies.filter((id: AllergenId) => ALLERGENS.some(a => a.id === id)) : [];
      const loaded = (household.data ?? []).map(toPerson).filter((p): p is Person => p !== null);
      const preferred = data?.default_everyone ? EVERYONE : loaded.some(p => p.id === data?.default_member_id) ? data!.default_member_id as string : ME;
      const name = typeof data?.display_name === 'string' ? data.display_name : '';
      setMyName(name); setNameDraft(name); setMembers(loaded); setDefaultView(preferred); setView(preferred);
      setAllergies(selected); setDraft(selected); setProfileReady(true); setPage(selected.length ? 'overview' : 'allergies');
      toast(selected.length ? 'Signed in · profile loaded' : 'Signed in · choose your allergies to start');
    });
  }, [session?.user.id]);

  const enterDemo = () => {
    ++generation.current; setDemo(true); setAllergies(['peanuts', 'tree-nuts']); setDraft(['peanuts', 'tree-nuts']);
    resetHousehold(); setMyName('Alex'); setNameDraft('Alex'); setMembers(DEMO_HOUSEHOLD); setDefaultView(EVERYONE); setView(EVERYONE);
    setProfileReady(true); setHistory([]); setProduct(null); setFeedback(''); setEmail(''); setPassword(''); setPage('overview');
    haptic.success(); toast('Demo ready · household of 3: Alex, Kha and DFK');
  };
  const navigate = (next: Page) => { setCamera(false); setPage(next); setProfileSaved(false); setFeedback(''); setDeleteConfirm(false); setEditing(null); setRemoving(null); if (next === 'settings') setNameDraft(myName); };
  const auth = async () => {
    if (!supabase) return;
    if (!email.trim() || !password || (authMode === 'signup' && (password.length < 12 || !consent))) { haptic.warning(); say('Enter email and password. New accounts require 12+ characters and privacy consent.'); return; }
    setAuthBusy(true); setFeedback('');
    try {
      const { data, error } = authMode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword('');
      if (!data.session) { haptic.success(); say('Check your email to confirm your account, then return here to sign in.', 'success'); setAuthMode('login'); }
    } catch { haptic.error(); say('Could not authenticate. Check your credentials, email confirmation, or try again later.', 'danger'); }
    finally { setAuthBusy(false); }
  };
  const saveAllergies = async () => {
    if (saving) return;
    setProfileSaved(false);
    if (!draft.length) { haptic.warning(); say('Choose at least one allergy to use barcode checking.'); return; }
    setSaving(true); setFeedback('');
    const current = generation.current;
    try {
      if (!demo) {
        if (!session || !supabase) throw new Error('Sign in again.');
        const { error } = await supabase.from('profiles').upsert({ id: session.user.id, allergies: draft, consent_version: '2026-09-30' });
        if (error) throw error;
      }
      if (current !== generation.current) return;
      setAllergies([...draft]); setProfileReady(true); setProfileSaved(true);
      const message = demo
        ? 'Allergy profile saved. Results now use these selections. Demo only: changes last until this session ends.'
        : 'Allergy profile saved. Results now use these selections. Saved to your account.';
      say(message, 'success'); haptic.success();
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
    } catch { haptic.error(); say('Profile could not be saved. Your previous selections are still active.', 'danger'); }
    finally { setSaving(false); }
  };
  const showProduct = (next: Product) => {
    haptic[RESULT[worstKind(assessPeople(next, viewPeople).map(r => r.assessment.kind))].haptic]();
    pendingScroll.current = true;
    setProduct(next); setHistory(prev => [{ product: next, at: new Date().toISOString() }, ...prev].slice(0, 30)); setPage('scan'); setFeedback(''); setCamera(false);
    toast(viewPeople.length > 1 ? `Checked for ${viewPeople.length} people` : viewPeople[0].id === ME ? `Checked against your ${allergies.length} saved allerg${allergies.length === 1 ? 'y' : 'ies'}` : `Checked for ${viewPeople[0].name}`, 'info');
  };
  const scan = async (code: string, fromCamera = false) => {
    if (scanLock.current || !profileReady || !allergies.length) return;
    scanLock.current = true; if (fromCamera) haptic.firm();
    pendingScroll.current = true;
    setBusy(true); setCamera(false); setProduct(null); setFeedback(''); setBarcode(code.trim());
    const current = generation.current;
    try {
      const found = await lookupProduct(code.trim(), Platform.OS !== 'web');
      if (generation.current !== current) return;
      if (found) showProduct(found); else { haptic.warning(); say('Product not found. No allergy assessment available. Read the package label.'); }
    } catch (e) { if (generation.current === current) { haptic.error(); say(e instanceof Error ? e.message : 'Lookup failed. Check your connection.', 'danger'); } }
    finally { scanLock.current = false; setBusy(false); }
  };
  const openCamera = async () => {
    setCameraAsking(true);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) { setFeedback(''); setCamera(true); } else { haptic.warning(); say('Camera access denied. Enter a barcode manually, or enable camera permission in device settings.'); }
    } finally { setCameraAsking(false); }
  };
  const leave = async () => {
    if (saving || busy) return;
    if (!demo && supabase) { const { error } = await supabase.auth.signOut(); if (error) { haptic.error(); say('Sign out failed. Check your connection and retry.', 'danger'); return; } }
    const wasDemo = demo;
    ++generation.current; setDemo(false); setSession(null); setProfileReady(false); setAllergies([]); setDraft([]); resetHousehold(); setHistory([]); setProduct(null); setFeedback(''); setPage('overview');
    toast(wasDemo ? 'Demo ended · session cleared' : 'Signed out · session cleared', 'info');
  };
  const deleteAccount = async () => {
    if (!supabase || demo) return;
    setSaving(true);
    const { error } = await supabase.rpc('delete_my_account');
    setSaving(false);
    if (error) { haptic.error(); say('Account could not be deleted. Please retry.', 'danger'); return; }
    await supabase.auth.signOut({ scope: 'local' });
    haptic.success();
    ++generation.current; setSession(null); setAllergies([]); setDraft([]); resetHousehold(); setHistory([]); setProduct(null); setProfileReady(false); setDeleteConfirm(false); say('Account and allergy profile deleted.', 'success');
  };
  // Settings changes are saved straight away; in the demo they only live in memory.
  const settingsReady = profileReady && (demo || allergies.length > 0);
  const failSettings = (message: string) => { haptic.error(); say(message, 'danger'); };
  const saveProfileFields = async (fields: Record<string, unknown>) => {
    if (demo) return true;
    if (!session || !supabase) return false;
    const { error } = await supabase.from('profiles').update(fields).eq('id', session.user.id);
    return !error;
  };
  const saveMyName = async () => {
    const next = cleanName(nameDraft);
    if (next && !validName(next)) { haptic.warning(); say('Names can be up to 40 characters.'); return; }
    setSettingsBusy(true); setFeedback('');
    const ok = await saveProfileFields({ display_name: next || null });
    setSettingsBusy(false);
    if (!ok) { failSettings('Your name could not be saved. Please retry.'); return; }
    setMyName(next); setNameDraft(next); haptic.success(); toast(next ? `Name saved · results show “${next}”` : 'Name cleared · results show “You”');
  };
  const chooseDefault = async (next: string) => {
    if (settingsBusy || next === defaultView) return;
    setSettingsBusy(true); setFeedback('');
    const ok = await saveProfileFields({ default_everyone: next === EVERYONE, default_member_id: next === EVERYONE || next === ME ? null : next });
    setSettingsBusy(false);
    if (!ok) { failSettings('Default could not be saved. Your previous choice is still active.'); return; }
    setDefaultView(next); setView(next); haptic.select(); toast(`Results now show ${next === EVERYONE ? 'everyone' : people.find(p => p.id === next)?.name ?? 'you'} by default`, 'info');
  };
  const saveMember = async () => {
    if (!editing || settingsBusy) return;
    const name = cleanName(editing.name);
    if (!validName(name)) { haptic.warning(); say('Enter a name of 1 to 40 characters.'); return; }
    if (!editing.allergies.length) { haptic.warning(); say(`Choose at least one allergy for ${name}.`); return; }
    if (!editing.id && members.length >= MAX_MEMBERS) { haptic.warning(); say(`A household can have up to ${MAX_MEMBERS} people besides you.`); return; }
    const allergiesInOrder = ALLERGENS.map(a => a.id).filter(id => editing.allergies.includes(id));
    setSettingsBusy(true); setFeedback('');
    let saved: Person | null = { id: editing.id ?? `local-${Date.now()}`, name, allergies: allergiesInOrder };
    if (!demo) {
      if (!supabase) saved = null;
      else {
        const query = editing.id
          ? supabase.from('household_members').update({ name, allergies: allergiesInOrder }).eq('id', editing.id)
          : supabase.from('household_members').insert({ name, allergies: allergiesInOrder, position: members.length });
        const { data, error } = await query.select('id, name, allergies').single();
        saved = error || !data ? null : toPerson(data);
      }
    }
    setSettingsBusy(false);
    if (!saved) { failSettings(`${name} could not be saved. Nothing changed.`); return; }
    const person = saved;
    setMembers(prev => editing.id ? prev.map(p => p.id === editing.id ? person : p) : [...prev, person]);
    setEditing(null); haptic.success(); toast(editing.id ? `${name} updated` : `${name} added to your household`);
  };
  const removeMember = async (id: string) => {
    if (settingsBusy) return;
    const person = members.find(p => p.id === id);
    setSettingsBusy(true); setFeedback('');
    let ok = demo;
    if (!demo && supabase) ok = !(await supabase.from('household_members').delete().eq('id', id)).error;
    setSettingsBusy(false);
    if (!ok) { failSettings(`${person?.name ?? 'This person'} could not be removed. Please retry.`); return; }
    // The database clears a default that pointed at this person; mirror that here.
    setMembers(prev => prev.filter(p => p.id !== id)); setRemoving(null);
    if (defaultView === id) setDefaultView(ME);
    if (view === id) setView(defaultView === id ? ME : defaultView);
    haptic.warning(); toast(`${person?.name ?? 'Person'} removed`, 'info');
  };
  const memberForm = editing && <Reveal testID="member-form" style={s.memberForm}><Text style={s.cardTitle}>{editing.id ? `Edit ${members.find(m => m.id === editing.id)?.name ?? 'person'}` : 'Add a person'}</Text>
              <Text style={s.label}>Name</Text><TextInput accessibilityLabel="Person's name" style={s.input} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} placeholder="e.g. Kha" placeholderTextColor={C.faint} maxLength={40} editable={!settingsBusy} />
              <Text style={s.label}>Their allergies</Text><View style={s.chips}>{ALLERGENS.map(a => { const on = editing.allergies.includes(a.id); return <Tap key={a.id} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={`${a.label} for this person`} haptic="select" scaleTo={.96} disabled={settingsBusy} onPress={() => setEditing({ ...editing, allergies: on ? editing.allergies.filter(id => id !== a.id) : [...editing.allergies, a.id] })} style={[s.viewChip, on && s.viewChipOn]}><Text style={[s.viewChipText, on && { color: C.onAccent }]}>{a.label}</Text></Tap>; })}</View>
              <View style={s.actionRow}><View style={{ flex: 1 }}><Button loading={settingsBusy} hapticKind="firm" onPress={saveMember}>{editing.id ? 'Save changes' : 'Add to household'}</Button></View><Button secondary disabled={settingsBusy} onPress={() => { setEditing(null); setFeedback(''); }}>Cancel</Button></View></Reveal>;
  const people: Person[] = [{ id: ME, name: myName || 'You', allergies }, ...members];
  const household = members.length > 0;
  const activeView = household && (view === EVERYONE || people.some(p => p.id === view)) ? view : ME;
  const viewPeople = activeView === EVERYONE ? people : people.filter(p => p.id === activeView);
  const viewOptions = [{ id: EVERYONE, label: `Everyone (${people.length})` }, ...people.map(p => ({ id: p.id, label: p.name }))];
  const results = product ? assessPeople(product, viewPeople) : [];
  const single = results.length === 1 ? results[0] : null;
  const summary = results.length > 1 ? householdSummary(results) : null;
  const assessment = single?.assessment ?? null;
  const evidence = single?.evidence ?? [];
  const focusAllergies = unionAllergies(viewPeople);
  const canScan = profileReady && allergies.length > 0;
  const profileChanged = draft.length !== allergies.length || draft.some(id => !allergies.includes(id));
  const inlineScanFeedback = page === 'scan' && canScan;
  const hint = barcodeHint(barcode);

  if (booting) return <View style={s.loading}><View style={[s.logo, { padding: 14 }]}><Leaf size={32} color={C.onAccent} /></View><ActivityIndicator color={C.green} /><Text style={s.body}>Opening PantryCheck…</Text></View>;
  if (!demo && !session) return <SafeAreaView style={s.root}><StatusBar style="auto" /><ScrollView contentContainerStyle={s.welcome} keyboardShouldPersistTaps="handled">
    <View style={[s.welcomeBrand, wide && { width: '48%' }]}>
      <View style={s.brand}><View style={s.logo}><Leaf size={25} color={C.onAccent} /></View><Text style={s.brandText}>pantrycheck<Text style={{ color: '#8FAD71' }}>.</Text></Text></View>
      
      <Text style={[s.welcomeTitle, { fontSize: wide ? 58 : 40, lineHeight: wide ? 64 : 46 }]}>Know more.{'\n'}Shop with{'\n'}your allergies{'\n'}in mind.</Text>
      <Text style={[s.body, { maxWidth: 430 }]}>Scan a barcode. See how reported ingredients match your allergy profile. Keep the final check on the label.</Text>
      <View style={s.welcomeChips}><Text style={s.smallPill}>9 US major allergens</Text><Text style={s.smallPill}>Private by design</Text></View>
      <View style={s.welcomeGraphic}><View style={s.welcomeIcon}><ScanBarcode size={54} color={C.green} strokeWidth={1.3} /></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>Your next shop, better informed.</Text><Text style={s.bodySmall}>Barcode first. Label always.</Text></View></View>
    </View>
    <View style={[s.authCard, wide && { width: '39%' }]}>
      <Text style={s.sectionTitle}>{authMode === 'signup' ? 'Make it personal.' : 'Welcome back.'}</Text>
      <Text style={s.body}>Your allergies. Your own space.</Text>
      {cloudConfigured ? <>
        <Text style={s.label}>Email address</Text><TextInput accessibilityLabel="Email address" style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Text style={s.label}>Password</Text><TextInput accessibilityLabel="Password" style={s.input} value={password} onChangeText={setPassword} placeholder={authMode === 'signup' ? 'At least 12 characters' : 'Your password'} placeholderTextColor={C.faint} secureTextEntry autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} />
        {authMode === 'signup' && <Tap accessibilityRole="checkbox" aria-checked={consent} accessibilityState={{ checked: consent }} haptic="select" scaleTo={.99} onPress={() => setConsent(!consent)} style={s.consent}><CheckMark checked={consent} /><Text style={[s.bodySmall, { flex: 1 }]}>I agree to store my allergy selections in my private account. Scans stay in this session; barcode numbers go to USDA FoodData Central and, if not found there, Open Food Facts. I can delete my account in App details.</Text></Tap>}
        <Button loading={authBusy} onPress={auth}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</Button>
        <Tap accessibilityRole="button" haptic="select" onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setFeedback(''); }}><Text style={s.link}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text></Tap>
      </> : <Notice kind="info">Employer preview · Cloud signup is not connected yet. Explore the working demo below. No account or password required.</Notice>}
      {feedback ? <Reveal trigger={feedback}><View accessibilityRole="alert"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
      <Button secondary onPress={enterDemo} icon={<Sparkles accessible={false} size={18} color={C.green} />}>Explore employer demo</Button>
      <View style={s.inline}><LockKeyhole size={16} color={C.muted} /><Text style={[s.bodySmall, { flex: 1 }]}>Demo data stays in memory. Nothing saved.</Text></View>
      <Text style={s.footnote}>Information support only. Not medical advice or a guarantee that food is safe. Always read the physical package.</Text>
    </View>
  </ScrollView></SafeAreaView>;

  const navItems: { page: Page; label: string; short: string }[] = [{ page: 'overview', label: 'Overview', short: 'Home' }, { page: 'scan', label: 'Scan a product', short: 'Scan' }, { page: 'allergies', label: 'My allergies', short: 'Allergies' }, { page: 'history', label: 'Recent scans', short: 'History' }, { page: 'settings', label: 'Settings', short: 'Settings' }, { page: 'about', label: 'App details', short: 'Details' }];
  // Five tabs fit a 320px phone; App details opens from Settings there.
  const mobileNavItems = navItems.filter(item => item.page !== 'about');
  const overallKind = summary?.kind ?? assessment?.kind;
  const result = product && overallKind ? RESULT[overallKind] : null;
  return <SafeAreaView style={s.root}><StatusBar style="auto" /><View style={s.appFrame}>
    {wide && <View style={s.sidebar}>
      <View style={s.brand}><View style={s.logo}><Leaf size={24} color={C.onAccent} /></View><Text style={s.brandText}>pantrycheck.</Text></View>
      <View style={{ height: 32 }} />
      {navItems.map(item => { const active = page === item.page; return <Tap key={item.page} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} haptic="select" scaleTo={.98} onPress={() => navigate(item.page)} style={[s.navItem, active && s.navActive]} pressedStyle={!active && { backgroundColor: C.pale }}>
        <Icon name={item.page} color={active ? C.green : C.muted} /><Text style={[s.navText, active && { color: C.green, fontWeight: '700' }]}>{item.label}</Text>{active && <View style={s.navDot} />}
      </Tap>; })}
      <View style={{ flex: 1 }} /><View style={s.sidebarNote}><ShieldCheck size={27} color={C.green} /><Text style={s.cardTitle}>Label first. Always.</Text><Text style={s.bodySmall}>We help you spot signals. The package is your final source.</Text></View>
      <Tap accessibilityRole="button" disabled={busy || saving} onPress={leave} style={s.account} pressedStyle={{ opacity: .7 }}><View style={s.avatar}><UserRound size={19} color={C.green} /></View><View style={{ flex: 1 }}><Text style={s.navText}>{demo ? 'Demo explorer' : 'Your account'}</Text><Text style={s.footnote}>{demo ? 'Local preview session' : 'Private allergy profile'}</Text></View><LogOut size={18} color={C.muted} /></Tap>
    </View>}
    <View style={s.main}>
      {wide && <View style={s.topbar}>
        <View style={[s.inline, { flexShrink: 1 }]}><Text style={s.breadcrumb}><Text style={{ color: C.ink, fontWeight: '600' }}>{navItems.find(n => n.page === page)?.label}</Text></Text></View>
        <View style={s.modeBadge}><View style={[s.navDot, { marginLeft: 0 }]} /><Text style={s.modeText}>{demo ? 'DEMO MODE' : 'CONNECTED'}</Text></View>
      </View>}
      <ScrollView ref={scrollRef} key={page} testID="page-scroll" style={s.pageScroll} contentContainerStyle={[s.content, !wide && { padding: 18, gap: 20 }]} keyboardShouldPersistTaps="handled">
        {demo && <View style={s.demoBar}><View style={[s.inline, { flexShrink: 1 }]}><Sparkles accessible={false} size={15} color={C.amber} /><Text style={[s.bodySmall, { color: C.amber, flexShrink: 1 }]}>Employer preview · fictional samples + live barcode lookup · nothing saved</Text></View><Tap accessibilityRole="button" onPress={leave} disabled={busy || saving} style={s.demoExit} pressedStyle={{ backgroundColor: C.amberPressed }}><Text style={[s.textLink, { color: C.amber }]}>Exit demo ↗</Text></Tap></View>}
        {feedback && page !== 'allergies' && page !== 'settings' && !inlineScanFeedback ? <Reveal trigger={feedback}><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
        {!profileReady && !demo && <Notice>Allergy profile loading or unavailable. Scanning stays locked until your profile is ready.</Notice>}
        {page === 'overview' && <>
          <View style={s.titleRow}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.pageTitle}>Good food starts with a check.</Text><Text style={s.body}>A clearer view of what’s in your next bite.</Text></View>{wide && <View style={s.roundLeaf}><Leaf size={28} color={C.green} /></View>}</View>
          <View style={[s.hero, !wide && { flexDirection: 'column' }]}><View style={[s.heroCopy, !wide && { padding: 24 }]}><Text style={[s.heroTitle, !wide && { fontSize: 29, lineHeight: 35 }]}>One scan.{'\n'}A more informed choice.</Text><Text style={s.heroBody}>Match reported ingredients to your allergies, right from the grocery aisle.</Text>
            <View style={{ alignSelf: 'flex-start' }}><Tap accessibilityRole="button" haptic="firm" onPress={() => navigate(canScan ? 'scan' : 'allergies')} style={s.limeButton} pressedStyle={{ backgroundColor: '#C6E26C' }}><ScanBarcode size={20} color={HERO_INK} /><Text style={s.limeButtonText}>{canScan ? 'Scan a barcode' : 'Set up allergies'}</Text><ArrowUpRight size={18} color={HERO_INK} /></Tap></View><Text style={s.heroCaption}>Always confirm with the physical package label.</Text></View>
            <View style={[s.heroArt, !wide && { display: 'none' }]}><View style={s.scanIllustration}><View style={s.inline}><View style={s.tinyLeaf}><Leaf size={18} color={C.green} /></View><Text style={s.labelMini}>PANTRY CHECK</Text></View><View style={s.packageIllustration}><Text style={s.packageBrand}>everyday</Text><Text style={s.packageName}>OAT{'\n'}CRACKERS</Text><Leaf size={42} color="#778749" strokeWidth={1} /><Text style={s.packageBottom}>FICTIONAL PACKAGING</Text></View><View style={s.illustrationBarcode}><ScanBarcode size={60} color={C.ink} /><Text style={s.footnote}>Scan. Compare. Read the label.</Text></View></View></View>
          </View>
          <View style={[s.columns, !wide && { flexDirection: 'column' }]}>
            <View style={[s.card, { flex: 1.2 }]}><View style={s.between}><Text style={s.cardTitle}>Your allergy profile</Text><Tap accessibilityRole="button" haptic="select" onPress={() => navigate('allergies')} style={s.pillLink} pressedStyle={{ backgroundColor: C.greenSoft }}><Text style={s.textLink}>Edit profile ↗</Text></Tap></View><Text style={s.bodySmall}>Every check is personal to you.</Text><View style={s.chips}>{allergies.map(id => <View key={id} style={s.allergyChip}><View style={s.chipDot} /><Text style={s.chipText}>{allergyLabel(id)}</Text></View>)}</View><View style={s.divider} /><View style={s.inline}><ShieldCheck size={16} color={C.green} /><Text style={s.bodySmall}>{allergies.length} selected · {demo ? 'Local session only' : 'Private to your account'}</Text></View>{household && <Tap accessibilityRole="button" haptic="select" onPress={() => navigate('settings')} style={s.inline}><UserRound size={16} color={C.green} /><Text style={[s.bodySmall, { flex: 1 }]}>Household: {members.map(m => m.name).join(', ')}</Text><Text style={s.textLink}>Manage ↗</Text></Tap>}</View>
            <View style={[s.card, { flex: 1 }]}><View style={s.between}><Text style={s.cardTitle}>Made for real life.</Text><View style={s.iconTile}><ScanBarcode size={21} color={C.green} /></View></View>{['Scan a packaged food barcode', 'Review your personal allergen signals', 'Double-check the package label'].map((line, i) => <View key={line} style={s.step}><Text style={s.stepNumber}>{i + 1}</Text><Text style={[s.bodySmall, { flex: 1 }]}>{line}</Text></View>)}</View>
          </View>
          <View style={s.between}><View><Text style={s.sectionTitle}>Give it a try</Text><Text style={s.bodySmall}>Four fictional products. Four useful outcomes.</Text></View><Text style={s.sampleLabel}>DEMO COLLECTION</Text></View>
          <View style={[s.sampleGrid, !wide && { flexDirection: 'column' }]}>{SAMPLES.map((item, i) => <Tap accessibilityRole="button" accessibilityLabel={`Try ${item.name}`} disabled={!canScan} key={item.barcode} haptic={null} onPress={() => showProduct(item)} style={[s.sampleCard, !canScan && { opacity: .5 }]} pressedStyle={{ borderColor: C.green }}>
            <View style={[s.sampleArt, { backgroundColor: SAMPLE_ART[i].bg }]}><View /><View style={[s.miniPack, { backgroundColor: SAMPLE_ART[i].pack }]}><Leaf size={19} color="white" /><Text style={s.miniPackText}>{SAMPLE_ART[i].word}</Text></View><ArrowUpRight size={17} color={C.muted} /></View>
            <View style={s.sampleInfo}><Text style={s.sampleName}>{item.name}</Text><View style={s.between}><Text style={s.footnote}>Fictional sample</Text><ChevronRight size={16} color={C.green} /></View></View>
          </Tap>)}</View>
        </>}
        {page === 'allergies' && <>
          <Text accessibilityRole="header" style={s.pageTitle}>Your allergies, front and center.</Text><Text style={s.body}>Choose from the nine US major food allergens. Select all that apply.</Text>
          <Notice kind="info">This app does not cover every allergy. Wheat is not a gluten or celiac-disease check. Crustacean shellfish does not cover mollusks.</Notice>
          <View style={[s.allergyGrid, singleColumn && s.groupedList]}>{ALLERGENS.map((a, i) => { const on = draft.includes(a.id); return <Tap key={a.id} accessibilityRole="checkbox" aria-checked={on} aria-disabled={saving || !profileReady} accessibilityLabel={a.label} accessibilityHint="Changes apply after saving your allergy profile." accessibilityState={{ checked: on, disabled: saving || !profileReady }} disabled={saving || !profileReady} haptic="select" scaleTo={.98}
            onPress={() => { setProfileSaved(false); setFeedback(''); setDraft(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]); }}
            style={[s.allergyOption, singleColumn ? [s.groupedRow, i < ALLERGENS.length - 1 && s.groupedSeparator] : [{ width: '48.5%' }, on && s.allergySelected]]} pressedStyle={(singleColumn || !on) && { backgroundColor: C.pale }}>
            <Text accessible={false} style={[s.allergenMark, on && { backgroundColor: C.green, color: C.onAccent }]}>{a.mark}</Text><Text style={[s.cardTitle, { flex: 1 }, on && { color: C.greenDeep }]}>{a.label}</Text><CheckMark checked={on} />
          </Tap>; })}</View>
        </>}
        {page === 'scan' && <>
          <Text accessibilityRole="header" style={s.pageTitle}>What’s in your next bite?</Text><Text style={s.body}>Scan a food barcode or enter the numbers beneath it.</Text>
          {!canScan ? <Button onPress={() => navigate('allergies')}>Choose your allergies</Button> : <View style={[s.columns, !wide && { flexDirection: 'column' }]}><View style={[s.card, { flex: 1 }]}>
            <View style={s.inline}><View style={s.iconTile}><ScanBarcode size={19} color={C.green} /></View><Text style={s.cardTitle}>Barcode scanner</Text></View>
            {camera && permission?.granted ? <View style={{ gap: 12 }}><View style={s.cameraFrame}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={event => { if (event.type === 'upc_e') { setCamera(false); haptic.warning(); say('UPC-E needs expansion. Enter the full UPC barcode or try another product.'); } else void scan(event.data, true); }} /><View pointerEvents="none" style={s.cameraGuide}><View style={s.cameraTarget} /><Text style={s.cameraGuideText}>Center the barcode inside the frame</Text></View></View><Button secondary onPress={() => setCamera(false)} icon={<X accessible={false} size={18} color={C.ink} />}>Close camera</Button></View>
              : <View style={s.scannerPlaceholder}><ScanBarcode size={60} color={C.green} strokeWidth={1.2} /><Text style={[s.bodySmall, { textAlign: 'center' }]}>{Platform.OS === 'web' ? 'Phone camera scanning in iOS / Android app.' : 'Point your camera at a UPC or EAN barcode.'}</Text><Button disabled={busy || Platform.OS === 'web'} loading={cameraAsking} onPress={openCamera} icon={<Camera accessible={false} size={18} color={C.onAccent} />}>Open camera</Button></View>}
            <Text style={s.label}>Or enter barcode manually</Text>
            <TextInput accessibilityLabel="Barcode number" style={[s.input, barcodeFocused && s.inputFocused, hint.ok && { borderColor: C.green }]} value={barcode} onChangeText={value => { setBarcode(value); if (feedback) setFeedback(''); }} onFocus={() => setBarcodeFocused(true)} onBlur={() => setBarcodeFocused(false)} keyboardType="number-pad" maxLength={14} placeholder="e.g. 3017620422003" placeholderTextColor={C.faint} onSubmitEditing={() => void scan(barcode)} editable={!busy} />
            <Text style={[s.footnote, hint.ok && { color: C.green, fontWeight: '600' }]}>{hint.text}</Text>
            <Button loading={busy} onPress={() => void scan(barcode)} icon={<Search accessible={false} size={18} color={C.onAccent} />}>{busy ? 'Checking product…' : 'Look up product'}</Button>
            {feedback && inlineScanFeedback ? <Reveal trigger={feedback}><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
            <Text style={s.footnote}>Manufacturer-submitted USDA FoodData Central records first; community Open Food Facts only if USDA has no match. Always compare with the package.</Text>
          </View><View style={[s.card, { flex: 1 }]}><Text style={s.cardTitle}>Try a sample instead</Text><Text style={s.bodySmall}>Fictional examples for your presentation. These never replace a live lookup.</Text>
            <View>{SAMPLES.map((item, i) => <Tap accessibilityRole="button" accessibilityLabel={item.name} disabled={busy} key={item.barcode} haptic={null} scaleTo={.98} onPress={() => showProduct(item)} style={s.sampleRow} pressedStyle={{ backgroundColor: C.pale }}><View style={[s.sampleSwatch, { backgroundColor: SAMPLE_ART[i].pack }]}><Leaf size={14} color="white" /></View><Text style={[s.navText, { flex: 1 }]}>{item.name}</Text><ChevronRight size={18} color={C.green} /></Tap>)}</View>
            <View style={s.inline}><LockKeyhole size={15} color={C.muted} /><Text style={[s.footnote, { flex: 1 }]}>Only barcode sent to the product provider. Allergy matching happens on your device.</Text></View></View></View>}
          {(busy || product) && <View onLayout={e => { if (pendingScroll.current) { pendingScroll.current = false; scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: true }); } }}>
            {busy ? <Reveal style={s.card}><View accessibilityRole="progressbar" aria-busy accessibilityLabel="Checking product" style={s.inline}><ActivityIndicator color={C.green} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>Checking product…</Text><Text style={s.bodySmall}>Looking up {barcode || 'barcode'} in USDA FoodData Central, then Open Food Facts, and matching against your profile.</Text></View></View><Skeleton width="60%" height={22} /><Skeleton height={64} /><Skeleton width="85%" /><Skeleton width="70%" /></Reveal>
              : product && result && <Reveal trigger={product} style={[s.card, s.resultCard]}><View testID="product-result" style={{ gap: 13 }}>
                <View style={s.between}><Text style={[s.sourceBadge, product.source === 'sample' ? { backgroundColor: C.amberSoft, color: C.amber } : { backgroundColor: C.blueSoft, color: C.blue }]}>{product.source === 'sample' ? 'FICTIONAL DEMO RESULT' : 'LIVE PRODUCT RESULT'}</Text><Tap accessibilityRole="button" accessibilityLabel="Close result" haptic="select" style={s.closeButton} pressedStyle={{ backgroundColor: C.border }} onPress={() => setProduct(null)}><X size={19} color={C.muted} /></Tap></View>
                <Text style={s.sectionTitle}>{product.name}</Text><Text style={s.bodySmall}>{product.brand} · {product.barcode}</Text>
                {household && <View style={s.detailBlock}><Text style={s.label}>Checking for</Text><View accessibilityRole="radiogroup" style={s.chips}>{viewOptions.map(o => { const on = activeView === o.id; return <Tap key={o.id} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={`Check for ${o.label}`} haptic="select" scaleTo={.96} onPress={() => setView(o.id)} style={[s.viewChip, on && s.viewChipOn]} pressedStyle={!on && { backgroundColor: C.pale }}><Text style={[s.viewChipText, on && { color: C.onAccent }]}>{o.label}</Text></Tap>; })}</View></View>}
                {summary ? <>
                  <View testID="household-summary" style={[s.resultBanner, { backgroundColor: tone[result.tone].bg, borderColor: tone[result.tone].fg }]}><View style={[s.resultIcon, { backgroundColor: tone[result.tone].fg }]}><result.Icon size={24} color={C.onAccent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={[s.resultTitle, { color: tone[result.tone].fg }]}>{summary.title}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{summary.detail}</Text></View></View>
                  {results.map(r => { const t = tone[RESULT[r.assessment.kind].tone]; return <View key={r.person.id} testID={`person-result-${r.person.name}`} style={[s.personCard, { borderColor: t.fg, backgroundColor: t.bg }]}><View style={[s.personAvatar, { backgroundColor: t.fg }]}><Text accessible={false} style={s.personInitial}>{r.person.name.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1, gap: 2 }}><Text style={s.cardTitle}>{r.person.name}</Text><Text style={s.footnote}>{r.person.allergies.map(allergyLabel).join(' · ')}</Text><Text style={[s.personVerdict, { color: t.fg }]}>{r.assessment.matches.length ? `${r.assessment.title}: ${r.assessment.matches.join(', ')}` : r.assessment.title}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{personReason(r)}</Text></View></View>; })}
                </> : assessment && <>
                <View style={[s.resultBanner, { backgroundColor: tone[result.tone].bg, borderColor: tone[result.tone].fg }]}><View style={[s.resultIcon, { backgroundColor: tone[result.tone].fg }]}><result.Icon size={24} color={C.onAccent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={[s.resultTitle, { color: tone[result.tone].fg }]}>{assessment.title}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{assessment.detail}</Text>{assessment.matches.length > 0 && <View style={s.chips}>{assessment.matches.map(m => <Text key={m} style={[s.matchChip, { color: tone[result.tone].fg, borderColor: tone[result.tone].fg }]}>{m}</Text>)}</View>}</View></View>
                {evidence.length > 0 && <View testID="result-evidence" style={s.detailBlock}><Text style={s.label}>Why this result</Text>{evidence.map(e => <View key={`${e.allergen}-${e.via}-${e.term}`} style={s.evidenceRow}><Text style={[s.evidenceAllergen, { color: tone[e.via === 'trace' ? 'warning' : 'danger'].fg }]}>{e.allergen}</Text><Text style={[s.bodySmall, { flex: 1, color: C.ink }]}>{evidenceText(e)}</Text></View>)}</View>}
                </>}
                <View style={s.detailBlock}><Text style={s.label}>Reported ingredients</Text><Text testID="result-ingredients" style={s.body}>{product.ingredients ? highlightIngredients(product.ingredients, focusAllergies).map((seg, i) => seg.allergen ? <Text key={i} accessibilityLabel={`${seg.text}, matches ${seg.allergen}`} style={s.ingredientHit}>{seg.text}</Text> : seg.text) : 'Not provided by the source.'}</Text></View>
                {product.source === 'usda' ? <View style={s.detailBlock}><Text style={s.label}>Allergen check</Text><Text style={s.bodySmall}>USDA provides the manufacturer ingredient statement, not separate allergen or trace tags. Only the text above was checked; cross-contact remains unknown.</Text></View> : <>
                  <View style={s.detailBlock}><Text style={s.label}>Reported allergen tags</Text><Text style={s.body}>{reportedTags(product.allergens) || 'None listed — does not confirm absence.'}</Text></View>
                  <View style={s.detailBlock}><Text style={s.label}>Reported traces</Text><Text style={s.body}>{reportedTags(product.traces) || 'None listed — cross-contact remains unknown.'}</Text></View>
                </>}
                <View style={s.divider} /><Text style={s.footnote}>{viewPeople.length > 1 ? `Checked against ${viewPeople.length} household profiles: ${viewPeople.map(p => p.name).join(', ')}.` : `Checked against ${viewPeople[0].id === ME && !myName ? 'your' : `${viewPeople[0].name}’s`} saved profile: ${viewPeople[0].allergies.map(allergyLabel).join(', ')}.`}</Text>
                <Text style={s.footnote}>{product.source === 'sample' ? 'Fictional sample. Not a real food assessment.' : product.source === 'usda' ? `USDA FoodData Central (manufacturer-submitted) · fetched ${new Date(product.fetchedAt).toLocaleString()} · record updated ${product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : 'unknown'}. Labels change; newer packages may differ.` : `Open Food Facts (community) · fetched ${new Date(product.fetchedAt).toLocaleString()} · source updated ${product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : 'unknown'}. Community data may be incomplete or outdated.`}</Text>
                {product.source === 'usda' && product.sourceId && <Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL(`https://fdc.nal.usda.gov/food-details/${product.sourceId}/nutrients`)}><Text style={s.link}>View source on USDA FoodData Central ↗</Text></Tap>}
                {product.source === 'openfoodfacts' && <Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL(`https://world.openfoodfacts.org/product/${product.barcode}`)}><Text style={s.link}>View source on Open Food Facts ↗</Text></Tap>}
              </View></Reveal>}
          </View>}
        </>}
        {page === 'history' && <><View style={s.between}><Text accessibilityRole="header" style={s.pageTitle}>Recent scans</Text>{history.length > 0 && <Button secondary hapticKind="warning" icon={<RotateCcw accessible={false} size={17} color={C.ink} />} onPress={() => { setHistory([]); toast('Scan history cleared', 'info'); }}>Clear history</Button>}</View><Text style={s.body}>Up to 30 recent checks. Results recalculate against the profiles you are checking for now. History clears on sign out or reload.</Text>
          {history.length === 0 ? <Reveal style={[s.card, s.empty]}><View style={[s.iconTile, { alignSelf: 'center', padding: 16, borderRadius: 40 }]}><Clock3 size={34} color={C.green} /></View><Text style={s.cardTitle}>Your next scan starts here.</Text><Text style={[s.bodySmall, { textAlign: 'center' }]}>Checked products will appear in this session.</Text><Button onPress={() => navigate('scan')}>Check a product</Button></Reveal>
            : history.map((entry, index) => { const rs = assessPeople(entry.product, viewPeople); const a = rs.length > 1 ? householdSummary(rs) : rs[0].assessment; const r = RESULT[a.kind]; return <Tap accessibilityRole="button" key={`${entry.at}-${index}`} haptic="select" scaleTo={.98} onPress={() => { navigate('scan'); pendingScroll.current = true; setProduct(entry.product); }} style={[s.card, s.historyRow]} pressedStyle={{ borderColor: C.green }}>
              <View style={[s.resultIcon, { backgroundColor: tone[r.tone].bg }]}><r.Icon size={20} color={tone[r.tone].fg} /></View>
              <View style={{ flex: 1 }}><Text style={s.cardTitle}>{entry.product.name}</Text><Text style={[s.bodySmall, { color: tone[r.tone].fg, fontWeight: '600' }]}>{a.title}</Text><Text style={s.footnote}>{sourceName(entry.product)} · {new Date(entry.at).toLocaleTimeString()}</Text></View><ChevronRight size={22} color={C.green} />
            </Tap>; })}</>}
        {page === 'settings' && <><Text accessibilityRole="header" style={s.pageTitle}>Settings</Text><Text style={s.body}>Add the people you shop for. One scan checks everyone, each against their own allergies.</Text>
          {!settingsReady && <Notice>Save your own allergy profile first. Household settings are stored with it.</Notice>}
          {feedback ? <Reveal trigger={feedback}><View testID="settings-feedback" accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
          <View style={s.card}><Text style={s.cardTitle}>Your name</Text><Text style={s.bodySmall}>Shown on household results. Leave blank to show “You”.</Text>
            <TextInput accessibilityLabel="Your name" style={s.input} value={nameDraft} onChangeText={setNameDraft} placeholder="You" placeholderTextColor={C.faint} maxLength={40} editable={settingsReady && !settingsBusy} onSubmitEditing={() => void saveMyName()} />
            {cleanName(nameDraft) !== myName && <Button loading={settingsBusy} disabled={!settingsReady} onPress={saveMyName}>Save name</Button>}</View>
          <View style={s.card}><View style={s.between}><Text style={s.cardTitle}>Household</Text><Text style={s.footnote}>{people.length} of {MAX_MEMBERS + 1} people</Text></View>
            <View style={s.memberRow}><View style={[s.personAvatar, { backgroundColor: C.green }]}><Text accessible={false} style={s.personInitial}>{(myName || 'You').charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{myName || 'You'} <Text style={s.footnote}>(you)</Text></Text><Text style={s.footnote}>{allergies.length ? allergies.map(allergyLabel).join(' · ') : 'No allergies saved yet'}</Text></View><Tap accessibilityRole="button" accessibilityLabel="Edit your allergies" haptic="select" onPress={() => navigate('allergies')} style={s.iconButton} pressedStyle={{ backgroundColor: C.pale }}><Pencil size={17} color={C.green} /></Tap></View>
            {members.map(m => editing?.id === m.id ? <View key={m.id}>{memberForm}</View> : <View key={m.id} style={{ gap: 10 }}><View style={s.memberRow}><View style={[s.personAvatar, { backgroundColor: C.blue }]}><Text accessible={false} style={s.personInitial}>{m.name.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{m.name}</Text><Text style={s.footnote}>{m.allergies.map(allergyLabel).join(' · ')}</Text></View>
              <Tap accessibilityRole="button" accessibilityLabel={`Edit ${m.name}`} haptic="select" disabled={settingsBusy} onPress={() => { setFeedback(''); setRemoving(null); setEditing({ id: m.id, name: m.name, allergies: [...m.allergies] }); }} style={s.iconButton} pressedStyle={{ backgroundColor: C.pale }}><Pencil size={17} color={C.green} /></Tap>
              <Tap accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} haptic="warning" disabled={settingsBusy} onPress={() => { setFeedback(''); setEditing(null); setRemoving(m.id); }} style={s.iconButton} pressedStyle={{ backgroundColor: C.redSoft }}><Trash2 size={17} color={C.red} /></Tap></View>
              {removing === m.id && <Reveal style={{ gap: 10 }}><Notice kind="danger">Remove {m.name} and their allergies from your household?{defaultView === m.id ? ' Results will show you by default instead.' : ''}</Notice><View style={s.actionRow}><View style={{ flex: 1 }}><Button variant="danger" hapticKind="warning" loading={settingsBusy} onPress={() => void removeMember(m.id)}>{`Remove ${m.name}`}</Button></View><Button secondary onPress={() => setRemoving(null)}>Keep</Button></View></Reveal>}</View>)}
            {editing && !editing.id ? memberForm
              : !editing && members.length < MAX_MEMBERS && <Button secondary disabled={!settingsReady || settingsBusy} onPress={() => { setFeedback(''); setRemoving(null); setEditing({ id: null, name: '', allergies: [] }); }} icon={<Plus accessible={false} size={18} color={C.green} />}>Add a person</Button>}
            {members.length >= MAX_MEMBERS && !editing && <Text style={s.footnote}>Household is full: up to {MAX_MEMBERS} people besides you.</Text>}</View>
          <View style={s.card}><Text style={s.cardTitle}>Show results for</Text><Text style={s.bodySmall}>Who a scan checks by default. You can switch on any result.</Text>
            <View accessibilityRole="radiogroup" style={{ gap: 6 }}>{(household ? viewOptions : viewOptions.filter(o => o.id === ME)).map(o => { const on = defaultView === o.id || (!household && o.id === ME); return <Tap key={o.id} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on, disabled: !settingsReady || settingsBusy }} accessibilityLabel={`Default: ${o.label}`} haptic={null} disabled={!settingsReady || settingsBusy} onPress={() => void chooseDefault(o.id)} style={[s.radioRow, on && s.allergySelected]} pressedStyle={!on && { backgroundColor: C.pale }}><View style={[s.radioDot, on && s.radioDotOn]} /><Text style={[s.navText, { flex: 1 }]}>{o.label}</Text></Tap>; })}</View>
            {!household && <Text style={s.footnote}>Add a person to choose “Everyone”.</Text>}</View>
          <Tap accessibilityRole="button" haptic="select" onPress={() => navigate('about')} style={[s.card, s.historyRow]} pressedStyle={{ borderColor: C.green }}><BookOpen size={20} color={C.green} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>App details</Text><Text style={s.footnote}>Data sources, privacy, sign out and account deletion</Text></View><ChevronRight size={20} color={C.green} /></Tap></>}
        {page === 'about' && <><Text accessibilityRole="header" style={s.pageTitle}>A little more behind the check.</Text>
          <View style={s.card}><View style={s.iconTile}><ShieldCheck size={24} color={C.green} /></View><Text style={s.sectionTitle}>Your profile belongs to you.</Text><Text style={s.body}>Connected accounts use Supabase Auth and PostgreSQL. Row-level security limits profile access to its owner. Native sessions use OS-backed secure storage; browser sessions stay in memory. Allergy selections never go to the food-data provider.</Text><Text style={s.body}>Demo profiles and scan history live only in memory. Camera frames are processed by the scanner; this app does not upload or save them. No advertising SDK or analytics added.</Text></View>
          <View style={s.card}><Text style={s.cardTitle}>Where food information comes from</Text><Text style={s.body}>Lookups use USDA FoodData Central Branded Foods first: public-domain label data submitted by manufacturers through GS1 and label-data partners. If USDA has no exact barcode match, the app falls back to Open Food Facts, a community-maintained database. Any record can be stale after a recipe or label change. This app checks reported tags and a limited English ingredient vocabulary. It cannot confirm absence, cross-contact, or suitability for your medical needs.</Text><Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL('https://fdc.nal.usda.gov')}><Text style={s.link}>USDA FoodData Central · public domain ↗</Text></Tap><Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL('https://world.openfoodfacts.org')}><Text style={s.link}>Open Food Facts · database under ODbL ↗</Text></Tap><Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL('https://opendatacommons.org/licenses/odbl/1-0/')}><Text style={s.link}>Read database license ↗</Text></Tap></View>
          <View style={[s.card, { backgroundColor: C.pale }]}><Sparkles size={25} color={C.green} /><Text style={s.cardTitle}>Next chapter: label recognition</Text><Text style={s.body}>Planned, not active: photograph an ingredient label, extract text, then ask the user to verify it. Recognizing a food’s appearance cannot prove what allergens it contains.</Text></View>
          <View style={s.card}><Text style={s.cardTitle}>Session & account</Text><Text style={s.bodySmall}>{demo ? 'Demo session: no account exists and no profile is stored.' : 'Delete account removes your Auth user and allergy profile. Provider backup retention is separate; see employer security notes.'}</Text><Button secondary disabled={busy || saving} onPress={leave} icon={<LogOut accessible={false} size={17} color={C.ink} />}>{demo ? 'Exit demo & clear session' : 'Sign out & clear session'}</Button>
            {!demo && <>{deleteConfirm ? <Reveal style={{ gap: 12 }}><Notice kind="danger">Delete your account and saved allergy profile permanently? This cannot be undone.</Notice><Button variant="danger" hapticKind="warning" loading={saving} onPress={deleteAccount}>{saving ? 'Deleting…' : 'Confirm permanent deletion'}</Button><Button secondary onPress={() => setDeleteConfirm(false)}>Cancel deletion</Button></Reveal> : <Tap accessibilityRole="button" haptic="warning" onPress={() => setDeleteConfirm(true)}><Text style={[s.link, { color: C.red }]}>Delete my account</Text></Tap>}</>}</View></>}
        <View style={s.footer}><Leaf size={15} color={C.muted} /><Text style={[s.footnote, { flexShrink: 1 }]}>A helpful check, never a safety guarantee. Always read the label.</Text><Text style={s.footnote}>PantryCheck / Demo 0.1</Text></View>
      </ScrollView>
      {page === 'allergies' && <View style={s.profileActions}>
        <Text accessibilityLiveRegion="polite" style={[s.bodySmall, profileChanged && { color: C.amber, fontWeight: '600' }]}>{draft.length} of {ALLERGENS.length} selected · {profileChanged ? 'Unsaved changes' : 'Saved profile'}</Text>
        <View accessible={false} style={s.progressTrack}><View style={[s.progressFill, { width: `${(draft.length / ALLERGENS.length) * 100}%` }]} /></View>
        {saving ? <Reveal><View accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.saveConfirmation}><ActivityIndicator color={C.green} /><Text style={[s.bodySmall, { flex: 1 }]}>Saving your allergy profile…</Text></View></Reveal>
          : feedback ? <Reveal trigger={feedback}><View testID="profile-save-feedback" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.saveConfirmation, { backgroundColor: tone[feedbackTone].bg }]}>{profileSaved ? <CheckMark checked round /> : <CircleAlert accessible={false} size={24} color={tone[feedbackTone].fg} />}<View style={{ flex: 1 }}>{profileSaved && <Text style={s.cardTitle}>Profile saved</Text>}<Text style={[s.bodySmall, { color: tone[feedbackTone].fg }]}>{feedback}</Text></View></View></Reveal> : null}
        <View style={s.actionRow}><View style={{ flex: 1 }}><Button onPress={saveAllergies} hapticKind="firm" loading={saving} disabled={!profileReady}>{saving ? 'Saving…' : 'Save allergy profile'}</Button></View>{profileChanged && <Button secondary disabled={saving} icon={<RotateCcw accessible={false} size={17} color={C.ink} />} onPress={() => { setDraft([...allergies]); setProfileSaved(false); setFeedback(''); toast('Changes discarded', 'info'); }}>Reset changes</Button>}</View>
      </View>}
      {!wide && <View style={s.mobileNavWrap}><View style={s.mobileNav}>{mobileNavItems.map(item => { const active = page === item.page; return <Tap key={item.page} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} haptic="select" scaleTo={.9} onPress={() => navigate(item.page)} style={s.mobileNavItem}>
        <View style={s.mobileNavIcon}><Icon name={item.page} color={active ? C.green : C.muted} /></View><Text style={[s.mobileNavText, active && { color: C.green, fontWeight: '600' }]}>{item.short}</Text>
      </Tap>; })}</View></View>}
    </View>
  </View></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><ToastProvider><AppContent /></ToastProvider></SafeAreaProvider>; }

const STYLES = bothSchemes((C: Palette, shadow) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: C.bg },
  appFrame: { flex: 1, flexDirection: 'row' }, main: { flex: 1, minWidth: 0, minHeight: 0 }, pageScroll: { flex: 1, minHeight: 0 },
  saveConfirmation: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.greenSoft },
  profileActions: { paddingHorizontal: 18, paddingVertical: 12, gap: 8, backgroundColor: C.paper, borderTopWidth: 1, borderColor: C.separator },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  progressTrack: { height: 4, borderRadius: 4, backgroundColor: C.pale, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4, backgroundColor: C.green },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { padding: 8, borderRadius: 13, backgroundColor: C.green }, brandText: { color: C.ink, fontSize: 23, fontWeight: '800', letterSpacing: -1 },
  sidebar: { width: '20%', maxWidth: 290, minWidth: 238, backgroundColor: C.chrome, borderRightWidth: 1, borderColor: C.border, padding: 24 },
  eyebrow: { color: C.muted, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', marginBottom: 8 },
  navItem: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 13, borderRadius: 12, marginBottom: 6 }, navActive: { backgroundColor: C.greenSoft }, navText: { color: C.ink, fontSize: 15, fontWeight: '500' }, navDot: { width: 7, height: 7, backgroundColor: C.green, borderRadius: 7, marginLeft: 'auto' },
  sidebarNote: { backgroundColor: C.pale, borderRadius: 16, padding: 18, gap: 10, marginTop: 30, marginBottom: 24 }, account: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, borderTopWidth: 1, borderColor: C.border }, avatar: { backgroundColor: C.greenSoft, padding: 9, borderRadius: 24 },
  topbar: { paddingVertical: 12, paddingHorizontal: 18, flexWrap: 'wrap', borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.chrome, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  breadcrumb: { fontSize: 13, color: C.muted, flexShrink: 1 }, modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.greenSoft, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20 }, modeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: C.green },
  content: { padding: 36, gap: 24, width: '100%', maxWidth: 1320, alignSelf: 'center' },
  demoBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, backgroundColor: C.amberSoft, borderRadius: 16, paddingVertical: 4, paddingLeft: 14, paddingRight: 4 }, demoExit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, pageTitle: { ...type.largeTitle, color: C.ink, marginBottom: 4, flexShrink: 1 },
  body: { ...type.body, color: C.muted }, bodySmall: { ...type.subhead, color: C.muted }, footnote: { ...type.footnote, color: C.muted }, roundLeaf: { padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 50, backgroundColor: C.paper },
  hero: { flexDirection: 'row', backgroundColor: '#214B3C', borderRadius: 26, overflow: 'hidden' }, heroCopy: { flex: 1.35, padding: 32, gap: 16 }, heroEyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '700', color: '#CBD9AE' }, heroTitle: { color: '#FAFCF4', fontSize: 36, fontWeight: '600', letterSpacing: -.8, lineHeight: 43 }, heroBody: { color: '#C7D4C7', fontSize: 15, lineHeight: 22, maxWidth: 360 }, heroCaption: { color: '#ADC2B0', ...type.footnote },
  limeButton: { backgroundColor: C.lime, minHeight: 50, paddingVertical: 13, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999 }, limeButtonText: { color: HERO_INK, ...type.headline },
  heroArt: { flex: .8, padding: 26, backgroundColor: '#2D5A48', alignItems: 'center', justifyContent: 'center' }, scanIllustration: { backgroundColor: '#FCFCF5', borderRadius: 20, padding: 17, width: '100%', maxWidth: 245, transform: [{ rotate: '5deg' }], gap: 12, boxShadow: '0px 14px 35px #183E3333' }, tinyLeaf: { padding: 5, backgroundColor: '#EDF2DD', borderRadius: 30 }, labelMini: { fontSize: 8, letterSpacing: 2, fontWeight: '700', color: C.green }, packageIllustration: { backgroundColor: '#E8EACD', padding: 14, alignItems: 'center', gap: 6, borderRadius: 10 }, packageBrand: { color: '#64754A', fontSize: 14, fontStyle: 'italic' }, packageName: { color: C.green, fontWeight: '800', fontSize: 25, textAlign: 'center', letterSpacing: 1 }, packageBottom: { fontSize: 7, letterSpacing: 1, color: C.muted }, illustrationBarcode: { alignItems: 'center' },
  columns: { flexDirection: 'row', gap: 20 }, card: { backgroundColor: C.paper, borderRadius: 22, padding: 20, gap: 13, boxShadow: shadow.card },
  cardTitle: { ...type.headline, color: C.ink }, sectionTitle: { ...type.title2, color: C.ink },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }, inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textLink: { color: C.green, fontSize: 13, fontWeight: '700' }, pillLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.greenSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 }, allergyChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: C.greenSoft, paddingVertical: 8, paddingHorizontal: 14 }, chipDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: C.green }, chipText: { fontSize: 13, color: C.green, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 3 }, iconTile: { alignSelf: 'flex-start', padding: 8, borderRadius: 11, backgroundColor: C.pale },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 }, stepNumber: { color: C.green, backgroundColor: C.greenSoft, fontSize: 12, fontWeight: '800', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20, overflow: 'hidden' }, sampleLabel: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.3 },
  sampleGrid: { flexDirection: 'row', gap: 16 }, sampleCard: { flex: 1, borderRadius: 22, overflow: 'hidden', backgroundColor: C.paper, boxShadow: shadow.card }, sampleArt: { padding: 15, minHeight: 128, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, sampleNumber: { fontSize: 10, fontWeight: '700', color: C.muted }, miniPack: { alignSelf: 'center', alignItems: 'center', gap: 12, paddingVertical: 20, paddingHorizontal: 14, borderRadius: 6, transform: [{ rotate: '-7deg' }], boxShadow: '0px 8px 14px rgba(0,0,0,0.12)' }, miniPackText: { color: '#FFFBEA', fontSize: 9, fontWeight: '800', letterSpacing: 1 }, sampleInfo: { padding: 14, gap: 8 }, sampleName: { fontSize: 14, fontWeight: '700', color: C.ink },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 15, borderTopWidth: 1, borderColor: C.border },
  welcome: { flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 44, padding: 24 }, welcomeBrand: { width: '100%', gap: 20, maxWidth: 590 }, welcomeTitle: { color: C.ink, fontWeight: '700', letterSpacing: -1.6 }, welcomeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  smallPill: { ...type.footnote, fontWeight: '600', color: C.green, backgroundColor: C.greenSoft, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, overflow: 'hidden' },
  welcomeGraphic: { flexDirection: 'row', gap: 18, padding: 18, backgroundColor: C.greenSoft, borderRadius: 20, alignItems: 'center' }, welcomeIcon: { padding: 12, borderRadius: 16, backgroundColor: C.paper },
  authCard: { width: '100%', maxWidth: 480, padding: 24, borderRadius: 26, backgroundColor: C.paper, gap: 16, boxShadow: shadow.card },
  label: { ...type.headline, color: C.ink, marginTop: 4 }, input: { minHeight: 50, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: C.fill, borderRadius: 14, ...type.body, color: C.ink, backgroundColor: C.fill }, inputFocused: { borderColor: C.green, backgroundColor: C.paper },
  link: { ...type.subhead, color: C.green, fontWeight: '600', minHeight: 44, paddingVertical: 11 }, consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  allergyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, allergyOption: { minHeight: 56, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: C.paper }, allergySelected: { borderColor: C.green },
  allergenMark: { minWidth: 40, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, overflow: 'hidden', fontSize: 14, color: C.green, backgroundColor: C.pale, fontWeight: '800' },
  scannerPlaceholder: { alignItems: 'center', gap: 14, paddingVertical: 22, paddingHorizontal: 14, backgroundColor: C.fill, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong },
  cameraFrame: { width: '100%', aspectRatio: 1, maxHeight: 420, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }, cameraGuide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 12 }, cameraTarget: { width: '76%', height: '34%', borderWidth: 3, borderColor: C.lime, borderRadius: 16 }, cameraGuideText: { color: 'white', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, overflow: 'hidden' },
  sampleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, borderBottomWidth: 1, borderColor: C.border }, sampleSwatch: { padding: 7, borderRadius: 9 },
  resultCard: { boxShadow: '0px 10px 30px rgba(23,51,43,0.08)' }, sourceBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden' }, closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: C.pale },
  resultBanner: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 18, marginVertical: 6 }, resultIcon: { alignSelf: 'flex-start', padding: 9, borderRadius: 14 }, resultTitle: { ...type.title3, fontWeight: '700' },
  matchChip: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden', backgroundColor: C.paper }, detailBlock: { gap: 4 }, viewChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.separator, backgroundColor: C.paper }, viewChipOn: { backgroundColor: C.green, borderColor: C.green }, viewChipText: { ...type.subhead, fontWeight: '600', color: C.muted }, personCard: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 }, personAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, personInitial: { color: C.onAccent, fontWeight: '800', fontSize: 16 }, personVerdict: { ...type.subhead, fontWeight: '700', marginTop: 4 }, memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 }, memberForm: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: C.pale }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.fill }, radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.borderStrong }, radioDotOn: { borderColor: C.green, borderWidth: 6 }, evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }, evidenceAllergen: { fontSize: 13, fontWeight: '800', minWidth: 72 }, ingredientHit: { color: C.red, backgroundColor: C.redSoft, fontWeight: '800', textDecorationLine: 'underline' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }, empty: { alignItems: 'center', paddingVertical: 44 },
  mobileNavWrap: { paddingHorizontal: '4%', paddingTop: 6, paddingBottom: 8, backgroundColor: C.bg },
  groupedList: { backgroundColor: C.paper, borderRadius: 22, overflow: 'hidden', rowGap: 0 }, groupedRow: { width: '100%', borderRadius: 0, borderWidth: 0 }, groupedSeparator: { borderBottomWidth: 1, borderBottomColor: C.separator },
  mobileNav: { flexDirection: 'row', backgroundColor: C.paper, borderRadius: 999, borderWidth: 1, borderColor: C.separator, paddingVertical: 4, paddingHorizontal: 4, boxShadow: '0px 8px 24px rgba(23,51,43,0.12)' }, mobileNavItem: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 2 }, mobileNavIcon: { paddingVertical: 2 }, mobileNavText: { textAlign: 'center', fontSize: 11, lineHeight: 13, fontWeight: '500', color: C.muted },
}));
