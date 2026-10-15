import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowUpRight, BookOpen, CalendarClock, Camera, Check, Languages, PackagePlus, Refrigerator, Undo2, ChevronRight, CircleAlert, CircleQuestionMark, Clock3, Info, Leaf, LockKeyhole, LogOut, Pencil, Plus, RotateCcw, ScanBarcode, Search, Settings, ShieldCheck, SunMoon, SlidersHorizontal, Sparkles, Trash2, TriangleAlert, UserRound, X } from 'lucide-react-native';
import type { Session } from '@supabase/supabase-js';
import { ALLERGENS, AllergenId, assess, Assessment, assessPeople, cleanName, Evidence, highlightIngredients, householdSummary, MAX_MEMBERS, Person, PersonResult, Product, unionAllergies, validBarcode, validName, worstKind } from './src/domain/allergens';
import { LookupError, lookupProduct, SAMPLES } from './src/data/products';
import { activePantry, addDays, closedPantry, dayOf, daysUntil, expiryState, ExpiryState, MAX_PANTRY, PantryItem, pantryAlerts, PantryStatus, SOON_DAYS, validDay } from './src/domain/pantry';
import { detectLanguage, I18n, isLang, Lang, languageName, LANGUAGES, makeI18n, MessageKey, translate } from './src/i18n';
import { cloudConfigured, setStaySignedIn, staySignedIn, supabase } from './src/lib/supabase';
import { cameraAvailable } from './src/lib/webScanner';
import { APPEARANCES, bothSchemes, C, Palette, setAppearance, themes, Tone, type, useAppearance, useScheme } from './src/ui/theme';
import { haptic } from './src/ui/haptics';
import { Button, CheckMark, Notice, Reveal, Skeleton, SwipeRow, Tap, ToastProvider, useToast } from './src/ui/controls';
import { CartLogo } from './src/ui/logo';

type Page = 'overview' | 'scan' | 'pantry' | 'allergies' | 'history' | 'settings' | 'about';
// 'me' is the account holder (allergies in profiles); other ids are household members.
const ME = 'me', EVERYONE = 'everyone';
const DEMO_HOUSEHOLD: Person[] = [{ id: 'demo-kha', name: 'Kha', allergies: ['milk', 'eggs'] }, { id: 'demo-dfk', name: 'DFK', allergies: ['sesame'] }];
type Entry = { product: Product; at: string };
// Fictional demo pantry, dated relative to today so the expiry alerts always show.
const demoPantry = (today: string): PantryItem[] => [[SAMPLES[2], -2], [SAMPLES[0], 1], [SAMPLES[1], 20]].map(([product, days], i) =>
  ({ id: `demo-pantry-${i}`, product: product as Product, expiresOn: addDays(today, days as number), status: 'active', addedAt: new Date(Date.now() - i * 60000).toISOString(), closedAt: null }));
const EXPIRY_TONE: Record<ExpiryState, Tone | null> = { expired: 'danger', today: 'warning', soon: 'warning', later: null, none: null };
const Icon = ({ name, size = 21, color = C.muted }: { name: Page; size?: number; color?: string }) => {
  const Component = { overview: Leaf, scan: ScanBarcode, pantry: Refrigerator, allergies: SlidersHorizontal, history: Clock3, settings: Settings, about: BookOpen }[name];
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
const reportedTags = (tags: string[]) => tags.map(tag => tag.trim().replace(/^[a-z]{2}:/i, '').replace(/-/g, ' ').toUpperCase()).join(', ');
const KIND_KEY = { contains: 'kind.contains', traces: 'kind.traces', unknown: 'kind.unknown', 'no-match': 'kind.noMatch' } as const;
// Everything the result screens say, in the chosen language. Domain code keeps English for tests and logs.
function words({ t, tp, list, day }: I18n) {
  const allergyLabel = (id: AllergenId) => t(`allergen.${id}` as MessageKey);
  const labelOf = (english: string) => { const a = ALLERGENS.find(x => x.label === english); return a ? allergyLabel(a.id) : english; };
  const evidenceText = (e: Evidence) => t(`evidence.${e.via}` as MessageKey, { term: e.term, allergen: labelOf(e.allergen).toLowerCase() });
  const kindTitle = (a: Assessment) => a.reason === 'no-profile' ? t('kind.noProfile.title') : t(`${KIND_KEY[a.kind]}.title` as MessageKey);
  const kindDetail = (a: Assessment) => a.reason === 'no-profile' ? t('kind.noProfile.detail') : a.reason === 'gluten' ? t('kind.unknown.gluten') : t(`${KIND_KEY[a.kind]}.detail` as MessageKey);
  const summaryTitle = (sm: ReturnType<typeof householdSummary>) => sm.kind === 'contains' ? tp('summary.contains', sm.count, { c: sm.count, n: sm.total })
    : sm.kind === 'traces' ? t('summary.traces', { c: sm.count, n: sm.total }) : sm.kind === 'unknown' ? t('summary.unknown', { c: sm.count, n: sm.total }) : t('summary.noMatch', { n: sm.total });
  const summaryDetail = (sm: ReturnType<typeof householdSummary>) => sm.kind === 'no-match' ? t('summary.noMatchDetail') : sm.kind === 'unknown' ? `${t('summary.missing')} ${t('summary.caution')}` : t('summary.caution');
  const personReason = ({ assessment: a, evidence }: PersonResult) => evidence.length ? `${evidence.map(evidenceText).join(t('evidence.join'))}${t('evidence.end')}` : a.kind === 'no-match' ? t('person.noMatchReason') : kindDetail(a);
  const sourceName = (p: Product) => p.source === 'sample' ? t('source.sample') : p.source === 'usda' ? 'USDA FoodData Central' : 'Open Food Facts';
  const allergyList = (ids: AllergenId[], sep?: string) => sep ? ids.map(allergyLabel).join(sep) : list(ids.map(allergyLabel));
  const expiryText = (item: Pick<PantryItem, 'expiresOn'>, today: string) => {
    const state = expiryState(item, today);
    if (state === 'none') return t('expiry.none');
    const days = daysUntil(item.expiresOn!, today);
    return state === 'expired' ? tp('expiry.expired', -days) : state === 'today' ? t('expiry.today') : state === 'soon' ? tp('expiry.soon', days) : t('expiry.later', { date: day(item.expiresOn!) });
  };
  return { allergyLabel, labelOf, evidenceText, kindTitle, kindDetail, summaryTitle, summaryDetail, personReason, sourceName, allergyList, expiryText };
}
const toPerson = (row: { id: unknown; name: unknown; allergies: unknown }): Person | null => typeof row.id === 'string' && typeof row.name === 'string' && Array.isArray(row.allergies)
  ? { id: row.id, name: row.name, allergies: ALLERGENS.map(a => a.id).filter(id => (row.allergies as unknown[]).includes(id)) } : null;
// Stored product snapshots are re-validated on load. Anything malformed is marked incomplete, never treated as allergen-free.
const toPantryItem = (row: Record<string, unknown>): PantryItem | null => {
  const p = row.product as Record<string, unknown> | null;
  if (typeof row.id !== 'string' || !p || typeof p !== 'object' || typeof p.name !== 'string') return null;
  const text = (v: unknown) => typeof v === 'string' ? v : '';
  const tags = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const intact = typeof p.ingredients === 'string' && Array.isArray(p.allergens) && Array.isArray(p.traces) && p.allergensKnown === true;
  const source = p.source === 'usda' || p.source === 'openfoodfacts' || p.source === 'sample' ? p.source : 'openfoodfacts';
  const product: Product = { barcode: text(p.barcode), name: p.name, brand: text(p.brand), ingredients: text(p.ingredients), allergens: tags(p.allergens), traces: tags(p.traces),
    allergensKnown: intact, source, sourceId: text(p.sourceId) || undefined, fetchedAt: text(p.fetchedAt) || new Date(0).toISOString(), updatedAt: text(p.updatedAt) || undefined,
    ingredientLanguage: intact && p.ingredientLanguage === 'en' ? 'en' : 'unknown' };
  const status: PantryStatus = row.status === 'consumed' || row.status === 'discarded' ? row.status : 'active';
  return { id: row.id, product, expiresOn: typeof row.expires_on === 'string' && validDay(row.expires_on) ? row.expires_on : null, status,
    addedAt: text(row.added_at) || new Date().toISOString(), closedAt: status === 'active' ? null : text(row.closed_at) || new Date().toISOString() };
};
function barcodeHint(value: string, { t }: I18n): { text: string; ok: boolean } {
  const digits = value.trim();
  if (!digits) return { text: t('hint.empty'), ok: false };
  if (!/^\d+$/.test(digits)) return { text: t('hint.digitsOnly'), ok: false };
  if (![8, 12, 13, 14].includes(digits.length)) return { text: t('hint.count', { n: digits.length }), ok: false };
  return validBarcode(digits) ? { text: t('hint.ok', { n: digits.length }), ok: true } : { text: t('hint.bad', { n: digits.length }), ok: false };
}

type LegalPage = 'disclaimer' | 'privacy' | 'terms';
// Legal pages are static English HTML in public/, served beside the web app; native opens the hosted copy.
const openLegal = (name: LegalPage) => Linking.openURL(Platform.OS === 'web' ? new URL(`${name}.html`, document.baseURI).href : `https://bitebeacon.org/${name}.html`);

function AppContent() {
  const { width, fontScale } = useWindowDimensions();
  const scheme = useScheme(); const appearance = useAppearance(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  const toast = useToast();
  const [lang, setLang] = useState<Lang>(detectLanguage);
  const i18n = useMemo(() => makeI18n(lang), [lang]);
  const { t, tp } = i18n;
  const { allergyLabel, labelOf, evidenceText, kindTitle, kindDetail, summaryTitle, summaryDetail, personReason, sourceName, allergyList, expiryText } = words(i18n);
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
  const [stay, setStay] = useState(staySignedIn);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [myName, setMyName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [members, setMembers] = useState<Person[]>([]);
  const [defaultView, setDefaultView] = useState(ME);
  const [view, setView] = useState(ME);
  const [editing, setEditing] = useState<{ id: string | null; name: string; allergies: AllergenId[] } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [pantryBusy, setPantryBusy] = useState(false);
  const [pantryDraft, setPantryDraft] = useState<{ date: string; none: boolean; error: boolean }>({ date: '', none: false, error: false });
  const today = dayOf(new Date());
  const resetHousehold = () => { setMyName(''); setNameDraft(''); setMembers([]); setDefaultView(ME); setView(ME); setEditing(null); setRemoving(null); };
  const say = (message: string, kind: Tone = 'warning') => { setFeedback(message); setFeedbackTone(kind); };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => { if (error) say(t('err.sessionRestore')); setSession(data.session); setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setBooting(false); });
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') supabase?.auth.startAutoRefresh();
      else { supabase?.auth.stopAutoRefresh(); setCamera(false); }
    });
    return () => { listener.subscription.unsubscribe(); app.remove(); };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    setHistory([]); setPantry([]); setProduct(null); setCamera(false); setProfileReady(false); setAllergies([]); setDraft([]); resetHousehold(); setLang(detectLanguage());
    if (!session || !supabase || demo) return;
    Promise.all([
      supabase.from('profiles').select('allergies, display_name, default_everyone, default_member_id, language').eq('id', session.user.id).maybeSingle(),
      supabase.from('household_members').select('id, name, allergies').order('position').order('created_at'),
      supabase.from('pantry_items').select('id, product, expires_on, status, added_at, closed_at').order('added_at', { ascending: false }),
    ]).then(([{ data, error }, household, stored]) => {
      if (generation.current !== current) return;
      if (error || household.error) { haptic.error(); say(t('err.profileLoad'), 'danger'); return; }
      // A pantry that fails to load must not block allergy checks; it shows empty.
      setPantry((stored.data ?? []).map(row => toPantryItem(row as Record<string, unknown>)).filter((i): i is PantryItem => i !== null));
      const selected = Array.isArray(data?.allergies) ? data.allergies.filter((id: AllergenId) => ALLERGENS.some(a => a.id === id)) : [];
      const loaded = (household.data ?? []).map(toPerson).filter((p): p is Person => p !== null);
      const preferred = data?.default_everyone ? EVERYONE : loaded.some(p => p.id === data?.default_member_id) ? data!.default_member_id as string : ME;
      const name = typeof data?.display_name === 'string' ? data.display_name : '';
      if (isLang(data?.language)) setLang(data.language);
      setMyName(name); setNameDraft(name); setMembers(loaded); setDefaultView(preferred); setView(preferred);
      setAllergies(selected); setDraft(selected); setProfileReady(true); setPage(selected.length ? 'overview' : 'allergies');
      toast(selected.length ? t('toast.signedInLoaded') : t('toast.signedInChoose'));
    });
  }, [session?.user.id]);

  const enterDemo = () => {
    ++generation.current; setDemo(true); setAllergies(['peanuts', 'tree-nuts']); setDraft(['peanuts', 'tree-nuts']);
    resetHousehold(); setMyName('Alex'); setNameDraft('Alex'); setMembers(DEMO_HOUSEHOLD); setDefaultView(EVERYONE); setView(EVERYONE);
    setProfileReady(true); setHistory([]); setPantry(demoPantry(dayOf(new Date()))); setProduct(null); setFeedback(''); setEmail(''); setPassword(''); setPage('overview');
    haptic.success(); toast(t('toast.demoReady', { n: 1 + DEMO_HOUSEHOLD.length, names: i18n.list(['Alex', ...DEMO_HOUSEHOLD.map(p => p.name)]) }));
  };
  const navigate = (next: Page) => { setCamera(false); setPage(next); setProfileSaved(false); setFeedback(''); setDeleteConfirm(false); setEditing(null); setRemoving(null); if (next === 'settings') setNameDraft(myName); };
  const auth = async () => {
    if (!supabase) return;
    if (!email.trim() || !password || (authMode === 'signup' && (password.length < 12 || !consent))) { haptic.warning(); say(t('auth.missing')); return; }
    setAuthBusy(true); setFeedback('');
    setStaySignedIn(stay);
    try {
      const { data, error } = authMode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword('');
      if (!data.session) { haptic.success(); say(t('auth.confirmEmail'), 'success'); setAuthMode('login'); }
    } catch { haptic.error(); say(t('auth.failed'), 'danger'); }
    finally { setAuthBusy(false); }
  };
  const saveAllergies = async () => {
    if (saving) return;
    setProfileSaved(false);
    if (!draft.length) { haptic.warning(); say(t('allergies.chooseOne')); return; }
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
        ? t('allergies.savedDemo')
        : t('allergies.savedCloud');
      say(message, 'success'); haptic.success();
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
    } catch { haptic.error(); say(t('allergies.saveFailed'), 'danger'); }
    finally { setSaving(false); }
  };
  const showProduct = (next: Product) => {
    haptic[RESULT[worstKind(assessPeople(next, viewPeople).map(r => r.assessment.kind))].haptic]();
    pendingScroll.current = true;
    setPantryDraft({ date: '', none: false, error: false });
    setProduct(next); setHistory(prev => [{ product: next, at: new Date().toISOString() }, ...prev].slice(0, 30)); setPage('scan'); setFeedback(''); setCamera(false);
    toast(viewPeople.length > 1 ? t('toast.checkedPeople', { n: viewPeople.length }) : viewPeople[0].id === ME ? tp('toast.checkedMine', allergies.length) : t('toast.checkedFor', { name: viewPeople[0].name }), 'info');
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
      if (found) showProduct(found); else { haptic.warning(); say(t('scan.notFound')); }
    } catch (e) { if (generation.current === current) { haptic.error(); say(e instanceof LookupError ? t(`lookup.${e.code}` as MessageKey) : lang === 'en' && e instanceof Error ? e.message : t('scan.lookupFailed'), 'danger'); } }
    finally { scanLock.current = false; setBusy(false); }
  };
  const openCamera = async () => {
    setCameraAsking(true);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) { setFeedback(''); setCamera(true); } else { haptic.warning(); say(t('camera.denied')); }
    } finally { setCameraAsking(false); }
  };
  const leave = async () => {
    if (saving || busy) return;
    if (!demo && supabase) { const { error } = await supabase.auth.signOut(); if (error) { haptic.error(); say(t('leave.failed'), 'danger'); return; } }
    const wasDemo = demo;
    ++generation.current; setDemo(false); setSession(null); setProfileReady(false); setAllergies([]); setDraft([]); resetHousehold(); setLang(detectLanguage()); setHistory([]); setPantry([]); setProduct(null); setFeedback(''); setPage('overview');
    toast(wasDemo ? t('toast.demoEnded') : t('toast.signedOut'), 'info');
  };
  const deleteAccount = async () => {
    if (!supabase || demo) return;
    setSaving(true);
    const { error } = await supabase.rpc('delete_my_account');
    setSaving(false);
    if (error) { haptic.error(); say(t('account.deleteFailed'), 'danger'); return; }
    await supabase.auth.signOut({ scope: 'local' });
    haptic.success();
    ++generation.current; setSession(null); setAllergies([]); setDraft([]); resetHousehold(); setLang(detectLanguage()); setHistory([]); setPantry([]); setProduct(null); setProfileReady(false); setDeleteConfirm(false); say(t('account.deleted'), 'success');
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
    if (next && !validName(next)) { haptic.warning(); say(t('settings.nameTooLong')); return; }
    setSettingsBusy(true); setFeedback('');
    const ok = await saveProfileFields({ display_name: next || null });
    setSettingsBusy(false);
    if (!ok) { failSettings(t('settings.nameFailed')); return; }
    setMyName(next); setNameDraft(next); haptic.success(); toast(next ? t('toast.nameSaved', { name: next }) : t('toast.nameCleared', { you: t('common.you') }));
  };
  const chooseDefault = async (next: string) => {
    if (settingsBusy || next === defaultView) return;
    setSettingsBusy(true); setFeedback('');
    const ok = await saveProfileFields({ default_everyone: next === EVERYONE, default_member_id: next === EVERYONE || next === ME ? null : next });
    setSettingsBusy(false);
    if (!ok) { failSettings(t('settings.defaultFailed')); return; }
    setDefaultView(next); setView(next); haptic.select(); toast(next === EVERYONE ? t('toast.defaultEveryone') : t('toast.defaultPerson', { name: people.find(p => p.id === next)?.name ?? t('common.you') }), 'info');
  };
  const saveMember = async () => {
    if (!editing || settingsBusy) return;
    const name = cleanName(editing.name);
    if (!validName(name)) { haptic.warning(); say(t('member.nameInvalid')); return; }
    if (!editing.allergies.length) { haptic.warning(); say(t('member.chooseAllergy', { name })); return; }
    if (!editing.id && members.length >= MAX_MEMBERS) { haptic.warning(); say(t('member.full', { n: MAX_MEMBERS })); return; }
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
    if (!saved) { failSettings(t('member.saveFailed', { name })); return; }
    const person = saved;
    setMembers(prev => editing.id ? prev.map(p => p.id === editing.id ? person : p) : [...prev, person]);
    setEditing(null); haptic.success(); toast(editing.id ? t('toast.memberUpdated', { name }) : t('toast.memberAdded', { name }));
  };
  const removeMember = async (id: string) => {
    if (settingsBusy) return;
    const person = members.find(p => p.id === id);
    setSettingsBusy(true); setFeedback('');
    let ok = demo;
    if (!demo && supabase) ok = !(await supabase.from('household_members').delete().eq('id', id)).error;
    setSettingsBusy(false);
    if (!ok) { failSettings(t('member.removeFailed', { name: person?.name ?? t('member.thisPerson') })); return; }
    // The database clears a default that pointed at this person; mirror that here.
    setMembers(prev => prev.filter(p => p.id !== id)); setRemoving(null);
    if (defaultView === id) setDefaultView(ME);
    if (view === id) setView(defaultView === id ? ME : defaultView);
    haptic.warning(); toast(t('toast.memberRemoved', { name: person?.name ?? t('member.thisPerson') }), 'info');
  };
  const chooseLanguage = async (next: Lang) => {
    if (settingsBusy || next === lang) return;
    setLang(next); setFeedback(''); haptic.select();
    if (demo || !allergies.length) { toast(translate(next, 'toast.languageSaved', { name: languageName(next) }), 'info'); return; }
    setSettingsBusy(true);
    const ok = await saveProfileFields({ language: next });
    setSettingsBusy(false);
    if (!ok) { haptic.warning(); say(translate(next, 'settings.languageFailed')); return; }
    toast(translate(next, 'toast.languageSaved', { name: languageName(next) }), 'info');
  };
  // Pantry changes save straight away; in the demo they only live in memory.
  const addToPantry = async (item: Product) => {
    if (pantryBusy) return;
    const date = pantryDraft.date.trim();
    if (!pantryDraft.none && !validDay(date)) { haptic.warning(); setPantryDraft({ ...pantryDraft, error: true }); return; }
    if (pantry.length >= MAX_PANTRY) { haptic.warning(); say(t('pantry.full', { n: MAX_PANTRY })); return; }
    const expiresOn = pantryDraft.none ? null : date;
    let saved: PantryItem | null = { id: `local-${Date.now()}`, product: item, expiresOn, status: 'active', addedAt: new Date().toISOString(), closedAt: null };
    if (!demo) {
      saved = null;
      if (supabase) {
        setPantryBusy(true);
        const { data, error } = await supabase.from('pantry_items').insert({ product: item, expires_on: expiresOn }).select('id, product, expires_on, status, added_at, closed_at').single();
        setPantryBusy(false);
        if (!error && data) saved = toPantryItem(data as Record<string, unknown>);
      }
    }
    if (!saved) { haptic.error(); say(t('pantry.saveFailed'), 'danger'); return; }
    const added = saved;
    setPantry(prev => [added, ...prev]); setPantryDraft({ date: '', none: false, error: false });
    haptic.success(); toast(t('toast.pantryAdded', { name: item.name }));
  };
  // One write path for used, thrown out and put back. The row moves straight away and snaps back if the save fails.
  const setPantryStatus = async (id: string, status: PantryStatus) => {
    const before = pantry.find(i => i.id === id);
    if (!before) return;
    const closedAt = status === 'active' ? null : new Date().toISOString();
    setPantry(prev => prev.map(i => i.id === id ? { ...i, status, closedAt } : i));
    const ok = demo || (!!supabase && !(await supabase.from('pantry_items').update({ status, closed_at: closedAt }).eq('id', id)).error);
    if (!ok) { setPantry(prev => prev.map(i => i.id === id ? before : i)); haptic.error(); say(t('pantry.updateFailed', { name: before.product.name }), 'danger'); return; }
    const name = before.product.name;
    if (status === 'consumed') { haptic.success(); toast(t('toast.pantryUsed', { name })); }
    else if (status === 'discarded') { haptic.warning(); toast(t('toast.pantryTossed', { name }), 'info'); }
    else { haptic.select(); toast(t('toast.pantryRestored', { name }), 'info'); }
  };
  const deletePantryItem = async (id: string) => {
    const item = pantry.find(i => i.id === id);
    if (!item) return;
    const ok = demo || (!!supabase && !(await supabase.from('pantry_items').delete().eq('id', id)).error);
    if (!ok) { haptic.error(); say(t('pantry.updateFailed', { name: item.product.name }), 'danger'); return; }
    setPantry(prev => prev.filter(i => i.id !== id)); haptic.warning(); toast(t('toast.pantryDeleted', { name: item.product.name }), 'info');
  };
  const openSaved = (item: Product) => { navigate('scan'); pendingScroll.current = true; setPantryDraft({ date: '', none: false, error: false }); setProduct(item); };
  const memberForm = editing && <Reveal testID="member-form" style={s.memberForm}><Text style={s.cardTitle}>{editing.id ? t('member.edit', { name: members.find(m => m.id === editing.id)?.name ?? t('member.thisPerson') }) : t('member.add')}</Text>
              <Text style={s.label}>{t('member.name')}</Text><TextInput accessibilityLabel={t('member.nameLabel')} style={s.input} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} placeholder={t('member.namePlaceholder')} placeholderTextColor={C.faint} maxLength={40} editable={!settingsBusy} />
              <Text style={s.label}>{t('member.allergies')}</Text><View style={s.chips}>{ALLERGENS.map(a => { const on = editing.allergies.includes(a.id); return <Tap key={a.id} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={t('member.allergyFor', { allergen: allergyLabel(a.id) })} haptic="select" scaleTo={.96} disabled={settingsBusy} onPress={() => setEditing({ ...editing, allergies: on ? editing.allergies.filter(id => id !== a.id) : [...editing.allergies, a.id] })} style={[s.viewChip, on && s.viewChipOn]}><Text style={[s.viewChipText, on && { color: C.onAccent }]}>{allergyLabel(a.id)}</Text></Tap>; })}</View>
              <View style={s.actionRow}><View style={{ flex: 1 }}><Button loading={settingsBusy} hapticKind="firm" onPress={saveMember}>{editing.id ? t('member.saveChanges') : t('member.addToHousehold')}</Button></View><Button secondary disabled={settingsBusy} onPress={() => { setEditing(null); setFeedback(''); }}>{t('common.cancel')}</Button></View></Reveal>;
  const people: Person[] = [{ id: ME, name: myName || t('common.you'), allergies }, ...members];
  const household = members.length > 0;
  const activeView = household && (view === EVERYONE || people.some(p => p.id === view)) ? view : ME;
  const viewPeople = activeView === EVERYONE ? people : people.filter(p => p.id === activeView);
  const viewOptions = [{ id: EVERYONE, label: t('view.everyone', { n: people.length }) }, ...people.map(p => ({ id: p.id, label: p.name }))];
  const results = product ? assessPeople(product, viewPeople) : [];
  const single = results.length === 1 ? results[0] : null;
  const summary = results.length > 1 ? householdSummary(results) : null;
  const assessment = single?.assessment ?? null;
  const evidence = single?.evidence ?? [];
  const focusAllergies = unionAllergies(viewPeople);
  const canScan = profileReady && allergies.length > 0;
  const profileChanged = draft.length !== allergies.length || draft.some(id => !allergies.includes(id));
  const inlineScanFeedback = page === 'scan' && canScan;
  const hint = barcodeHint(barcode, i18n);
  const alerts = pantryAlerts(pantry, today);
  const alertCount = alerts.expired + alerts.today + alerts.soon;
  const alertText = [alerts.expired && t('pantry.alert.expired', { n: alerts.expired }), alerts.today && t('pantry.alert.today', { n: alerts.today }), alerts.soon && t('pantry.alert.soon', { days: SOON_DAYS, n: alerts.soon })].filter(Boolean).join(' · ');
  const activeItems = activePantry(pantry, today);
  const closedItems = closedPantry(pantry);
  const inPantry = product ? pantry.filter(i => i.status === 'active' && i.product.barcode === product.barcode).length : 0;
  const nextMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return dayOf(d); })();
  const quickDates = [{ key: 'week', label: t('pantry.quick.week'), date: addDays(today, 7) }, { key: 'twoWeeks', label: t('pantry.quick.twoWeeks'), date: addDays(today, 14) }, { key: 'month', label: t('pantry.quick.month'), date: nextMonth }];
  const pantryRow = (item: PantryItem) => {
    const rs = assessPeople(item.product, viewPeople);
    const r = RESULT[worstKind(rs.map(x => x.assessment.kind))];
    const et = EXPIRY_TONE[expiryState(item, today)];
    const name = item.product.name;
    return <SwipeRow key={item.id} testID={`pantry-item-${name}`} onRight={() => void setPantryStatus(item.id, 'consumed')} onLeft={() => void setPantryStatus(item.id, 'discarded')}
      rightLabel={t('pantry.used')} leftLabel={t('pantry.toss')} rightIcon={<Check accessible={false} size={20} color={C.onAccent} />} leftIcon={<Trash2 accessible={false} size={20} color={C.onAccent} />}>
      {guard => <View style={[s.card, s.pantryCard]}>
        <Tap accessibilityRole="button" accessibilityLabel={t('pantry.openLabel', { name })} haptic="select" scaleTo={.98} onPress={guard(() => openSaved(item.product))} style={s.pantryMain}>
          <View style={[s.resultIcon, { backgroundColor: tone[r.tone].bg }]}><r.Icon size={20} color={tone[r.tone].fg} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.cardTitle}>{name}</Text>
            {item.product.source === 'sample' && <Text style={[s.sourceBadge, s.pantryBadge]}>{t('result.fictional')}</Text>}
            <Text style={[s.bodySmall, et ? { color: tone[et].fg, fontWeight: '700' } : null]}>{expiryText(item, today)}</Text>
            <Text style={s.footnote}>{rs.length > 1 ? summaryTitle(householdSummary(rs)) : kindTitle(rs[0].assessment)}</Text>
          </View>
          <ChevronRight size={20} color={C.green} />
        </Tap>
        <View style={s.actionRow}>
          <Tap accessibilityRole="button" accessibilityLabel={t('pantry.usedLabel', { name })} haptic={null} onPress={guard(() => void setPantryStatus(item.id, 'consumed'))} style={[s.pantryAction, { backgroundColor: C.greenSoft }]} pressedStyle={{ backgroundColor: C.greenSoftPressed }}><Check accessible={false} size={17} color={C.green} /><Text style={[s.pantryActionText, { color: C.green }]}>{t('pantry.used')}</Text></Tap>
          <Tap accessibilityRole="button" accessibilityLabel={t('pantry.tossLabel', { name })} haptic={null} onPress={guard(() => void setPantryStatus(item.id, 'discarded'))} style={[s.pantryAction, { backgroundColor: C.redSoft }]} pressedStyle={{ opacity: .8 }}><Trash2 accessible={false} size={17} color={C.red} /><Text style={[s.pantryActionText, { color: C.red }]}>{t('pantry.toss')}</Text></Tap>
        </View>
      </View>}
    </SwipeRow>;
  };

  if (booting) return <View style={s.loading}><CartLogo size={56} color={C.green} /><ActivityIndicator color={C.green} /><Text style={s.body}>{t('app.opening')}</Text></View>;
  if (!demo && !session) return <SafeAreaView style={s.root}><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /><ScrollView contentContainerStyle={s.welcome} keyboardShouldPersistTaps="handled">
    <View style={[s.welcomeBrand, wide && { width: '48%' }]}>
      <View style={s.brand}><CartLogo size={42} color={C.green} /><Text style={s.brandText}>BiteBeacon</Text></View>
      
      <Text style={[s.welcomeTitle, { fontSize: wide ? 58 : 40, lineHeight: wide ? 64 : 46 }]}>{t('welcome.title')}</Text>
      <Text style={[s.body, { maxWidth: 430 }]}>{t('welcome.body')}</Text>
      <View style={s.welcomeChips}><Text style={s.smallPill}>{t('welcome.pill1')}</Text><Text style={s.smallPill}>{t('welcome.pill2')}</Text></View>
      <View style={s.welcomeGraphic}><View style={s.welcomeIcon}><ScanBarcode size={54} color={C.green} strokeWidth={1.3} /></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{t('welcome.graphicTitle')}</Text><Text style={s.bodySmall}>{t('welcome.graphicBody')}</Text></View></View>
    </View>
    <View style={[s.authCard, wide && { width: '39%' }]}>
      <Text style={s.sectionTitle}>{authMode === 'signup' ? t('auth.signupTitle') : t('auth.loginTitle')}</Text>
      <Text style={s.body}>{t('auth.tagline')}</Text>
      {cloudConfigured ? <>
        <Text style={s.label}>{t('auth.email')}</Text><TextInput accessibilityLabel={t('auth.email')} style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Text style={s.label}>{t('auth.password')}</Text><TextInput accessibilityLabel={t('auth.password')} style={s.input} value={password} onChangeText={setPassword} placeholder={authMode === 'signup' ? t('auth.passwordNew') : t('auth.passwordCurrent')} placeholderTextColor={C.faint} secureTextEntry autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} />
        {authMode === 'signup' && <Tap accessibilityRole="checkbox" aria-checked={consent} accessibilityState={{ checked: consent }} haptic="select" scaleTo={.99} onPress={() => setConsent(!consent)} style={s.consent}><CheckMark checked={consent} /><Text style={[s.bodySmall, { flex: 1 }]}>{t('auth.consent')}</Text></Tap>}
        {authMode === 'signup' && <View style={s.legalRow}><Tap accessibilityRole="link" haptic="select" onPress={() => openLegal('terms')}><Text style={s.link}>{t('legal.terms')}</Text></Tap><Tap accessibilityRole="link" haptic="select" onPress={() => openLegal('privacy')}><Text style={s.link}>{t('legal.privacy')}</Text></Tap></View>}
        {Platform.OS === 'web' && <Tap testID="stay-signed-in" accessibilityRole="checkbox" aria-checked={stay} accessibilityState={{ checked: stay }} haptic="select" scaleTo={.99} onPress={() => setStay(!stay)} style={s.consent}><CheckMark checked={stay} /><Text style={[s.bodySmall, { flex: 1 }]}>{t('auth.remember')}</Text></Tap>}
        <Button loading={authBusy} onPress={auth}>{authBusy ? t('auth.wait') : authMode === 'signup' ? t('auth.create') : t('auth.signIn')}</Button>
        <Tap accessibilityRole="button" haptic="select" onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setFeedback(''); }}><Text style={s.link}>{authMode === 'signup' ? t('auth.toLogin') : t('auth.toSignup')}</Text></Tap>
      </> : <Notice kind="info">{t('auth.noCloud')}</Notice>}
      {feedback ? <Reveal trigger={feedback}><View accessibilityRole="alert"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
      <Button secondary onPress={enterDemo} icon={<Sparkles accessible={false} size={18} color={C.green} />}>{t('demo.explore')}</Button>
      <View style={s.inline}><LockKeyhole size={16} color={C.muted} /><Text style={[s.bodySmall, { flex: 1 }]}>{t('demo.memoryOnly')}</Text></View>
      <Text style={s.footnote}>{t('disclaimer.welcome')}</Text>
      <Tap accessibilityRole="link" haptic="select" onPress={() => openLegal('disclaimer')}><Text style={s.link}>{t('legal.disclaimer')}</Text></Tap>
    </View>
  </ScrollView></SafeAreaView>;

  const navItems: { page: Page; label: string; short: string }[] = (['overview', 'scan', 'pantry', 'allergies', 'history', 'settings', 'about'] as const).map(page => ({ page, label: t(`nav.${page}` as MessageKey), short: t(`nav.${page}.short` as MessageKey) }));
  // Five tabs fit a 320px phone; history opens from Pantry and App details from Settings there.
  const mobileNavItems = navItems.filter(item => item.page !== 'about' && item.page !== 'history');
  const overallKind = summary?.kind ?? assessment?.kind;
  const result = product && overallKind ? RESULT[overallKind] : null;
  return <SafeAreaView style={s.root}><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /><View style={s.appFrame}>
    {wide && <View style={s.sidebar}>
      <View style={s.brand}><CartLogo size={40} color={C.green} /><Text style={s.brandText}>BiteBeacon</Text></View>
      <View style={{ height: 32 }} />
      {navItems.map(item => { const active = page === item.page; return <Tap key={item.page} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} haptic="select" scaleTo={.98} onPress={() => navigate(item.page)} style={[s.navItem, active && s.navActive]} pressedStyle={!active && { backgroundColor: C.pale }}>
        <Icon name={item.page} color={active ? C.green : C.muted} /><Text style={[s.navText, { flexShrink: 1 }, active && { color: C.green, fontWeight: '700' }]}>{item.label}</Text>{item.page === 'pantry' && alertCount > 0 && <Text style={s.navCount}>{alertCount}</Text>}{active && <View style={s.navDot} />}
      </Tap>; })}
      <View style={{ flex: 1 }} /><View style={s.sidebarNote}><ShieldCheck size={27} color={C.green} /><Text style={s.cardTitle}>{t('sidebar.labelFirst')}</Text><Text style={s.bodySmall}>{t('sidebar.labelFirstBody')}</Text></View>
      <Tap accessibilityRole="button" disabled={busy || saving} onPress={leave} style={s.account} pressedStyle={{ opacity: .7 }}><View style={s.avatar}><UserRound size={19} color={C.green} /></View><View style={{ flex: 1 }}><Text style={s.navText}>{demo ? t('account.demo') : t('account.yours')}</Text><Text style={s.footnote}>{demo ? t('account.demoSub') : t('account.yoursSub')}</Text></View><LogOut size={18} color={C.muted} /></Tap>
    </View>}
    <View style={s.main}>
      {wide && <View style={s.topbar}>
        <View style={[s.inline, { flexShrink: 1 }]}><Text style={s.breadcrumb}><Text style={{ color: C.ink, fontWeight: '600' }}>{navItems.find(n => n.page === page)?.label}</Text></Text></View>
        <View style={s.modeBadge}><View style={[s.navDot, { marginLeft: 0 }]} /><Text style={s.modeText}>{demo ? t('mode.demo') : t('mode.connected')}</Text></View>
      </View>}
      <ScrollView ref={scrollRef} key={page} testID="page-scroll" style={s.pageScroll} contentContainerStyle={[s.content, !wide && { padding: 18, gap: 20 }]} keyboardShouldPersistTaps="handled">
        {demo && <View style={s.demoBar}><View style={[s.inline, { flexShrink: 1 }]}><Sparkles accessible={false} size={15} color={C.amber} /><Text style={[s.bodySmall, { color: C.amber, flexShrink: 1 }]}>{t('demo.bar')}</Text></View><Tap accessibilityRole="button" onPress={leave} disabled={busy || saving} style={s.demoExit} pressedStyle={{ backgroundColor: C.amberPressed }}><Text style={[s.textLink, { color: C.amber }]}>{t('demo.exit')}</Text></Tap></View>}
        {feedback && page !== 'allergies' && page !== 'settings' && !inlineScanFeedback ? <Reveal trigger={feedback}><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
        {!profileReady && !demo && <Notice>{t('profile.locked')}</Notice>}
        {page === 'overview' && <>
          <View style={s.titleRow}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.pageTitle}>{t('overview.title')}</Text><Text style={s.body}>{t('overview.subtitle')}</Text></View>{wide && <View style={s.roundLeaf}><Leaf size={28} color={C.green} /></View>}</View>
          {alertCount > 0 && <Tap testID="pantry-alert" accessibilityRole="button" accessibilityHint={t('pantry.open')} haptic="select" scaleTo={.98} onPress={() => navigate('pantry')} style={[s.card, s.historyRow, { backgroundColor: tone[alerts.expired ? 'danger' : 'warning'].bg }]}>
            <CalendarClock size={24} color={tone[alerts.expired ? 'danger' : 'warning'].fg} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>{t('pantry.alertTitle')}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{alertText}</Text></View><Text style={s.textLink}>{t('pantry.open')}</Text></Tap>}
          <View style={[s.hero, !wide && { flexDirection: 'column' }]}><View style={[s.heroCopy, !wide && { padding: 24 }]}><Text style={[s.heroTitle, !wide && { fontSize: 29, lineHeight: 35 }]}>{t('hero.title')}</Text><Text style={s.heroBody}>{t('hero.body')}</Text>
            <View style={{ alignSelf: 'flex-start' }}><Tap accessibilityRole="button" haptic="firm" onPress={() => navigate(canScan ? 'scan' : 'allergies')} style={s.limeButton} pressedStyle={{ backgroundColor: '#C6E26C' }}><ScanBarcode size={20} color={HERO_INK} /><Text style={s.limeButtonText}>{canScan ? t('hero.scan') : t('hero.setup')}</Text><ArrowUpRight size={18} color={HERO_INK} /></Tap></View><Text style={s.heroCaption}>{t('hero.caption')}</Text></View>
            <View style={[s.heroArt, !wide && { display: 'none' }]}><View style={s.scanIllustration}><View style={s.inline}><CartLogo size={24} color={C.green} /><Text style={s.labelMini}>BITEBEACON</Text></View><View style={s.packageIllustration}><Text style={s.packageBrand}>everyday</Text><Text style={s.packageName}>OAT{'\n'}CRACKERS</Text><Leaf size={42} color="#778749" strokeWidth={1} /><Text style={s.packageBottom}>{t('illus.fictional')}</Text></View><View style={s.illustrationBarcode}><ScanBarcode size={60} color={C.ink} /><Text style={s.footnote}>{t('illus.caption')}</Text></View></View></View>
          </View>
          <View style={[s.columns, !wide && { flexDirection: 'column' }]}>
            <View style={[s.card, { flex: 1.2 }]}><View style={s.between}><Text style={s.cardTitle}>{t('profileCard.title')}</Text><Tap accessibilityRole="button" haptic="select" onPress={() => navigate('allergies')} style={s.pillLink} pressedStyle={{ backgroundColor: C.greenSoft }}><Text style={s.textLink}>{t('profileCard.edit')}</Text></Tap></View><Text style={s.bodySmall}>{t('profileCard.personal')}</Text><View style={s.chips}>{allergies.map(id => <View key={id} style={s.allergyChip}><View style={s.chipDot} /><Text style={s.chipText}>{allergyLabel(id)}</Text></View>)}</View><View style={s.divider} /><View style={s.inline}><ShieldCheck size={16} color={C.green} /><Text style={s.bodySmall}>{t('profileCard.selected', { n: allergies.length })} · {demo ? t('profileCard.local') : t('profileCard.private')}</Text></View>{household && <Tap accessibilityRole="button" haptic="select" onPress={() => navigate('settings')} style={s.inline}><UserRound size={16} color={C.green} /><Text style={[s.bodySmall, { flex: 1 }]}>{t('profileCard.household', { names: i18n.list(members.map(m => m.name)) })}</Text><Text style={s.textLink}>{t('profileCard.manage')}</Text></Tap>}</View>
            <View style={[s.card, { flex: 1 }]}><View style={s.between}><Text style={s.cardTitle}>{t('real.title')}</Text><View style={s.iconTile}><ScanBarcode size={21} color={C.green} /></View></View>{[t('real.step1'), t('real.step2'), t('real.step3')].map((line, i) => <View key={line} style={s.step}><Text style={s.stepNumber}>{i + 1}</Text><Text style={[s.bodySmall, { flex: 1 }]}>{line}</Text></View>)}</View>
          </View>
          <View style={s.between}><View><Text style={s.sectionTitle}>{t('samples.title')}</Text><Text style={s.bodySmall}>{t('samples.body')}</Text></View><Text style={s.sampleLabel}>{t('samples.label')}</Text></View>
          <View style={[s.sampleGrid, !wide && { flexDirection: 'column' }]}>{SAMPLES.map((item, i) => <Tap accessibilityRole="button" accessibilityLabel={t('samples.try', { name: item.name })} disabled={!canScan} key={item.barcode} haptic={null} onPress={() => showProduct(item)} style={[s.sampleCard, !canScan && { opacity: .5 }]} pressedStyle={{ borderColor: C.green }}>
            <View style={[s.sampleArt, { backgroundColor: SAMPLE_ART[i].bg }]}><View /><View style={[s.miniPack, { backgroundColor: SAMPLE_ART[i].pack }]}><Leaf size={19} color="white" /><Text style={s.miniPackText}>{SAMPLE_ART[i].word}</Text></View><ArrowUpRight size={17} color={C.muted} /></View>
            <View style={s.sampleInfo}><Text style={s.sampleName}>{item.name}</Text><View style={s.between}><Text style={s.footnote}>{t('samples.fictional')}</Text><ChevronRight size={16} color={C.green} /></View></View>
          </Tap>)}</View>
        </>}
        {page === 'allergies' && <>
          <Text accessibilityRole="header" style={s.pageTitle}>{t('allergies.title')}</Text><Text style={s.body}>{t('allergies.body')}</Text>
          <Notice kind="info">{t('allergies.notice')}</Notice>
          <View style={[s.allergyGrid, singleColumn && s.groupedList]}>{ALLERGENS.map((a, i) => { const on = draft.includes(a.id); return <Tap key={a.id} accessibilityRole="checkbox" aria-checked={on} aria-disabled={saving || !profileReady} accessibilityLabel={allergyLabel(a.id)} accessibilityHint={t('allergies.hint')} accessibilityState={{ checked: on, disabled: saving || !profileReady }} disabled={saving || !profileReady} haptic="select" scaleTo={.98}
            onPress={() => { setProfileSaved(false); setFeedback(''); setDraft(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]); }}
            style={[s.allergyOption, singleColumn ? [s.groupedRow, i < ALLERGENS.length - 1 && s.groupedSeparator] : [{ width: '48.5%' }, on && s.allergySelected]]} pressedStyle={(singleColumn || !on) && { backgroundColor: C.pale }}>
            <Text accessible={false} style={[s.allergenMark, on && { backgroundColor: C.green, color: C.onAccent }]}>{lang === 'en' ? a.mark : Array.from(allergyLabel(a.id))[0]}</Text><Text style={[s.cardTitle, { flex: 1 }, on && { color: C.greenDeep }]}>{allergyLabel(a.id)}</Text><CheckMark checked={on} />
          </Tap>; })}</View>
        </>}
        {page === 'scan' && <>
          <Text accessibilityRole="header" style={s.pageTitle}>{t('scan.title')}</Text><Text style={s.body}>{t('scan.body')}</Text>
          {!canScan ? <Button onPress={() => navigate('allergies')}>{t('scan.chooseAllergies')}</Button> : <View style={[s.columns, !wide && { flexDirection: 'column' }]}><View style={[s.card, { flex: 1 }]}>
            <View style={s.inline}><View style={s.iconTile}><ScanBarcode size={19} color={C.green} /></View><Text style={s.cardTitle}>{t('scan.scanner')}</Text></View>
            {camera && permission?.granted ? <View style={{ gap: 12 }}><View style={s.cameraFrame}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={event => { if (event.type === 'upc_e') { setCamera(false); haptic.warning(); say(t('scan.upce')); } else void scan(event.data, true); }} /><View pointerEvents="none" style={s.cameraGuide}><View style={s.cameraTarget} /><Text style={s.cameraGuideText}>{t('scan.center')}</Text></View></View><Button secondary onPress={() => setCamera(false)} icon={<X accessible={false} size={18} color={C.ink} />}>{t('scan.closeCamera')}</Button></View>
              : <View style={s.scannerPlaceholder}><ScanBarcode size={60} color={C.green} strokeWidth={1.2} /><Text style={[s.bodySmall, { textAlign: 'center' }]}>{cameraAvailable() ? t('scan.pointCamera') : t('scan.webCamera')}</Text><Button disabled={busy || !cameraAvailable()} loading={cameraAsking} onPress={openCamera} icon={<Camera accessible={false} size={18} color={C.onAccent} />}>{t('scan.openCamera')}</Button></View>}
            <Text style={s.label}>{t('scan.manual')}</Text>
            <TextInput accessibilityLabel={t('scan.barcodeLabel')} style={[s.input, barcodeFocused && s.inputFocused, hint.ok && { borderColor: C.green }]} value={barcode} onChangeText={value => { setBarcode(value); if (feedback) setFeedback(''); }} onFocus={() => setBarcodeFocused(true)} onBlur={() => setBarcodeFocused(false)} keyboardType="number-pad" maxLength={14} placeholder="e.g. 3017620422003" placeholderTextColor={C.faint} onSubmitEditing={() => void scan(barcode)} editable={!busy} />
            <Text style={[s.footnote, hint.ok && { color: C.green, fontWeight: '600' }]}>{hint.text}</Text>
            <Button loading={busy} onPress={() => void scan(barcode)} icon={<Search accessible={false} size={18} color={C.onAccent} />}>{busy ? t('scan.checking') : t('scan.lookUp')}</Button>
            {feedback && inlineScanFeedback ? <Reveal trigger={feedback}><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
            <Text style={s.footnote}>{t('scan.sources')}</Text>
          </View><View style={[s.card, { flex: 1 }]}><Text style={s.cardTitle}>{t('scan.trySample')}</Text><Text style={s.bodySmall}>{t('scan.sampleBody')}</Text>
            <View>{SAMPLES.map((item, i) => <Tap accessibilityRole="button" accessibilityLabel={item.name} disabled={busy} key={item.barcode} haptic={null} scaleTo={.98} onPress={() => showProduct(item)} style={s.sampleRow} pressedStyle={{ backgroundColor: C.pale }}><View style={[s.sampleSwatch, { backgroundColor: SAMPLE_ART[i].pack }]}><Leaf size={14} color="white" /></View><Text style={[s.navText, { flex: 1 }]}>{item.name}</Text><ChevronRight size={18} color={C.green} /></Tap>)}</View>
            <View style={s.inline}><LockKeyhole size={15} color={C.muted} /><Text style={[s.footnote, { flex: 1 }]}>{t('scan.privacy')}</Text></View></View></View>}
          {(busy || product) && <View onLayout={e => { if (pendingScroll.current) { pendingScroll.current = false; scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: true }); } }}>
            {busy ? <Reveal style={s.card}><View accessibilityRole="progressbar" aria-busy accessibilityLabel={t('scan.checkingLabel')} style={s.inline}><ActivityIndicator color={C.green} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>{t('scan.checking')}</Text><Text style={s.bodySmall}>{t('scan.lookingUp', { barcode: barcode || t('scan.barcodeWord') })}</Text></View></View><Skeleton width="60%" height={22} /><Skeleton height={64} /><Skeleton width="85%" /><Skeleton width="70%" /></Reveal>
              : product && result && <Reveal trigger={product} style={[s.card, s.resultCard]}><View testID="product-result" style={{ gap: 13 }}>
                <View style={s.between}><Text style={[s.sourceBadge, product.source === 'sample' ? { backgroundColor: C.amberSoft, color: C.amber } : { backgroundColor: C.blueSoft, color: C.blue }]}>{product.source === 'sample' ? t('result.fictional') : t('result.live')}</Text><Tap accessibilityRole="button" accessibilityLabel={t('result.close')} haptic="select" style={s.closeButton} pressedStyle={{ backgroundColor: C.border }} onPress={() => setProduct(null)}><X size={19} color={C.muted} /></Tap></View>
                <Text style={s.sectionTitle}>{product.name}</Text><Text style={s.bodySmall}>{product.brand} · {product.barcode}</Text>
                {household && <View style={s.detailBlock}><Text style={s.label}>{t('result.checkingFor')}</Text><View accessibilityRole="radiogroup" style={s.chips}>{viewOptions.map(o => { const on = activeView === o.id; return <Tap key={o.id} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={t('result.checkFor', { label: o.label })} haptic="select" scaleTo={.96} onPress={() => setView(o.id)} style={[s.viewChip, on && s.viewChipOn]} pressedStyle={!on && { backgroundColor: C.pale }}><Text style={[s.viewChipText, on && { color: C.onAccent }]}>{o.label}</Text></Tap>; })}</View></View>}
                {summary ? <>
                  <View testID="household-summary" style={[s.resultBanner, { backgroundColor: tone[result.tone].bg, borderColor: tone[result.tone].fg }]}><View style={[s.resultIcon, { backgroundColor: tone[result.tone].fg }]}><result.Icon size={24} color={C.onAccent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={[s.resultTitle, { color: tone[result.tone].fg }]}>{summaryTitle(summary)}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{summaryDetail(summary)}</Text></View></View>
                  {results.map(r => { const tn = tone[RESULT[r.assessment.kind].tone]; return <View key={r.person.id} testID={`person-result-${r.person.name}`} style={[s.personCard, { borderColor: tn.fg, backgroundColor: tn.bg }]}><View style={[s.personAvatar, { backgroundColor: tn.fg }]}><Text accessible={false} style={s.personInitial}>{r.person.name.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1, gap: 2 }}><Text style={s.cardTitle}>{r.person.name}</Text><Text style={s.footnote}>{allergyList(r.person.allergies, ' · ')}</Text><Text style={[s.personVerdict, { color: tn.fg }]}>{r.assessment.matches.length ? t('result.verdict', { title: kindTitle(r.assessment), matches: i18n.list(r.assessment.matches.map(labelOf)) }) : kindTitle(r.assessment)}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{personReason(r)}</Text></View></View>; })}
                </> : assessment && <>
                <View style={[s.resultBanner, { backgroundColor: tone[result.tone].bg, borderColor: tone[result.tone].fg }]}><View style={[s.resultIcon, { backgroundColor: tone[result.tone].fg }]}><result.Icon size={24} color={C.onAccent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={[s.resultTitle, { color: tone[result.tone].fg }]}>{kindTitle(assessment)}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{kindDetail(assessment)}</Text>{assessment.matches.length > 0 && <View style={s.chips}>{assessment.matches.map(m => <Text key={m} style={[s.matchChip, { color: tone[result.tone].fg, borderColor: tone[result.tone].fg }]}>{labelOf(m)}</Text>)}</View>}</View></View>
                {evidence.length > 0 && <View testID="result-evidence" style={s.detailBlock}><Text style={s.label}>{t('result.why')}</Text>{evidence.map(e => <View key={`${e.allergen}-${e.via}-${e.term}`} style={s.evidenceRow}><Text style={[s.evidenceAllergen, { color: tone[e.via === 'trace' ? 'warning' : 'danger'].fg }]}>{labelOf(e.allergen)}</Text><Text style={[s.bodySmall, { flex: 1, color: C.ink }]}>{evidenceText(e)}</Text></View>)}</View>}
                </>}
                <View testID="pantry-add" style={s.pantryAdd}>
                  <View style={s.inline}><PackagePlus accessible={false} size={20} color={C.green} /><Text accessibilityRole="header" style={s.cardTitle}>{t('pantry.addTitle')}</Text></View>
                  <Text style={s.bodySmall}>{t('pantry.addBody')}</Text>
                  <View accessibilityRole="radiogroup" style={s.chips}>{[...quickDates, { key: 'none', label: t('pantry.quick.none'), date: '' }].map(q => { const on = q.key === 'none' ? pantryDraft.none : !pantryDraft.none && pantryDraft.date === q.date; return <Tap key={q.key} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} haptic="select" scaleTo={.96} onPress={() => setPantryDraft({ date: q.date, none: q.key === 'none', error: false })} style={[s.viewChip, on && s.viewChipOn]} pressedStyle={!on && { backgroundColor: C.pale }}><Text style={[s.viewChipText, on && { color: C.onAccent }]}>{q.label}</Text></Tap>; })}</View>
                  <TextInput accessibilityLabel={t('pantry.dateLabel')} style={[s.input, pantryDraft.error && { borderColor: C.red }]} value={pantryDraft.none ? '' : pantryDraft.date} onChangeText={date => setPantryDraft({ date, none: false, error: false })} placeholder="YYYY-MM-DD" placeholderTextColor={C.faint} maxLength={10} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} onSubmitEditing={() => void addToPantry(product)} editable={!pantryBusy} />
                  {pantryDraft.error ? <Text accessibilityRole="alert" style={[s.footnote, { color: tone.danger.fg, fontWeight: '600' }]}>{t('pantry.dateInvalid')}</Text>
                    : !pantryDraft.none && validDay(pantryDraft.date) ? <Text style={[s.footnote, EXPIRY_TONE[expiryState({ expiresOn: pantryDraft.date }, today)] ? { color: tone[EXPIRY_TONE[expiryState({ expiresOn: pantryDraft.date }, today)]!].fg, fontWeight: '600' } : null]}>{expiryText({ expiresOn: pantryDraft.date }, today)}</Text> : null}
                  <Button loading={pantryBusy} hapticKind="firm" onPress={() => void addToPantry(product)} icon={<PackagePlus accessible={false} size={18} color={C.onAccent} />}>{t('pantry.add')}</Button>
                  {inPantry > 0 && <Text style={s.footnote}>{t('pantry.inPantry', { n: inPantry })}</Text>}
                </View>
                <View style={s.detailBlock}><Text style={s.label}>{t('result.ingredients')}</Text><Text testID="result-ingredients" style={s.body}>{product.ingredients ? highlightIngredients(product.ingredients, focusAllergies).map((seg, i) => !seg.allergen ? seg.text : seg.hidden
                  ? <Text key={i} accessibilityLabel={t('result.hiddenLabel', { text: seg.text, allergen: labelOf(seg.allergen).toLowerCase() })}><Text style={s.ingredientHit}>{seg.text}</Text><Text style={s.hiddenTag}> {t('result.hiddenTag', { allergen: labelOf(seg.allergen).toLowerCase() })}</Text></Text>
                  : <Text key={i} accessibilityLabel={t('result.matchesLabel', { text: seg.text, allergen: labelOf(seg.allergen) })} style={s.ingredientHit}>{seg.text}</Text>) : t('result.noIngredients')}</Text></View>
                {product.source === 'usda' ? <View style={s.detailBlock}><Text style={s.label}>{t('result.allergenCheck')}</Text><Text style={s.bodySmall}>{t('result.usdaNote')}</Text></View> : <>
                  <View style={s.detailBlock}><Text style={s.label}>{t('result.tags')}</Text><Text style={s.body}>{reportedTags(product.allergens) || t('result.noTags')}</Text></View>
                  <View style={s.detailBlock}><Text style={s.label}>{t('result.traces')}</Text><Text style={s.body}>{reportedTags(product.traces) || t('result.noTraces')}</Text></View>
                </>}
                <View style={s.divider} /><Text style={s.footnote}>{viewPeople.length > 1 ? t('result.checkedHousehold', { n: viewPeople.length, names: i18n.list(viewPeople.map(p => p.name)) }) : viewPeople[0].id === ME && !myName ? t('result.checkedYour', { allergies: allergyList(viewPeople[0].allergies) }) : t('result.checkedPerson', { name: viewPeople[0].name, allergies: allergyList(viewPeople[0].allergies) })}</Text>
                <Text style={s.footnote}>{product.source === 'sample' ? t('result.sampleNote') : t(product.source === 'usda' ? 'result.usdaMeta' : 'result.offMeta', { fetched: i18n.dateTime(product.fetchedAt), updated: product.updatedAt ? i18n.date(product.updatedAt) : t('common.unknown') })}</Text>
                {product.source === 'usda' && product.sourceId && <Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL(`https://fdc.nal.usda.gov/food-details/${product.sourceId}/nutrients`)}><Text style={s.link}>{t('result.viewUsda')}</Text></Tap>}
                {product.source === 'openfoodfacts' && <Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL(`https://world.openfoodfacts.org/product/${product.barcode}`)}><Text style={s.link}>{t('result.viewOff')}</Text></Tap>}
              </View></Reveal>}
          </View>}
        </>}
        {page === 'pantry' && <>
          <View style={s.between}><Text accessibilityRole="header" style={s.pageTitle}>{t('pantry.title')}</Text><Tap accessibilityRole="button" accessibilityLabel={t('nav.history')} haptic="select" onPress={() => navigate('history')} style={s.pillLink} pressedStyle={{ backgroundColor: C.greenSoftPressed }}><Text style={s.textLink}>{t('nav.history')}</Text></Tap></View>
          <Text style={s.body}>{t('pantry.body')}</Text>
          {alertCount > 0 && <Notice kind={alerts.expired ? 'danger' : 'warning'}>{alertText}</Notice>}
          {activeItems.length === 0 ? <Reveal style={[s.card, s.empty]}><View style={[s.iconTile, { alignSelf: 'center', padding: 16, borderRadius: 40 }]}><Refrigerator size={34} color={C.green} /></View><Text style={s.cardTitle}>{t('pantry.emptyTitle')}</Text><Text style={[s.bodySmall, { textAlign: 'center' }]}>{t('pantry.emptyBody')}</Text><Button onPress={() => navigate('scan')}>{t('history.check')}</Button></Reveal>
            : <View style={{ gap: 12 }}>{activeItems.map(pantryRow)}</View>}
        </>}
        {page === 'history' && <><View style={s.between}><Text accessibilityRole="header" style={s.pageTitle}>{t('history.title')}</Text>{history.length > 0 && <Button secondary hapticKind="warning" icon={<RotateCcw accessible={false} size={17} color={C.ink} />} onPress={() => { setHistory([]); toast(t('toast.historyCleared'), 'info'); }}>{t('history.clear')}</Button>}</View>
          <Text accessibilityRole="header" style={s.sectionTitle}>{t('history.scansTitle')}</Text><Text style={s.bodySmall}>{t('history.body')}</Text>
          {history.length === 0 ? <Reveal style={[s.card, s.empty]}><View style={[s.iconTile, { alignSelf: 'center', padding: 16, borderRadius: 40 }]}><Clock3 size={34} color={C.green} /></View><Text style={s.cardTitle}>{t('history.emptyTitle')}</Text><Text style={[s.bodySmall, { textAlign: 'center' }]}>{t('history.emptyBody')}</Text><Button onPress={() => navigate('scan')}>{t('history.check')}</Button></Reveal>
            : history.map((entry, index) => { const rs = assessPeople(entry.product, viewPeople); const sm = rs.length > 1 ? householdSummary(rs) : null; const r = RESULT[sm?.kind ?? rs[0].assessment.kind]; return <Tap accessibilityRole="button" key={`${entry.at}-${index}`} haptic="select" scaleTo={.98} onPress={() => { navigate('scan'); pendingScroll.current = true; setProduct(entry.product); }} style={[s.card, s.historyRow]} pressedStyle={{ borderColor: C.green }}>
              <View style={[s.resultIcon, { backgroundColor: tone[r.tone].bg }]}><r.Icon size={20} color={tone[r.tone].fg} /></View>
              <View style={{ flex: 1 }}><Text style={s.cardTitle}>{entry.product.name}</Text><Text style={[s.bodySmall, { color: tone[r.tone].fg, fontWeight: '600' }]}>{sm ? summaryTitle(sm) : kindTitle(rs[0].assessment)}</Text><Text style={s.footnote}>{sourceName(entry.product)} · {i18n.time(entry.at)}</Text></View><ChevronRight size={22} color={C.green} />
            </Tap>; })}
          <Text accessibilityRole="header" style={[s.sectionTitle, { marginTop: 8 }]}>{t('history.pantryTitle')}</Text><Text style={s.bodySmall}>{t('history.pantryBody')}</Text>
          {closedItems.length === 0 ? <View style={[s.card, s.historyRow]}><Refrigerator size={20} color={C.muted} /><Text style={[s.bodySmall, { flex: 1 }]}>{t('history.pantryEmpty')}</Text></View>
            : closedItems.map(item => { const name = item.product.name; const used = item.status === 'consumed'; return <View key={item.id} testID={`pantry-history-${name}`} style={[s.card, s.historyRow]}>
              <View style={[s.resultIcon, { backgroundColor: used ? C.greenSoft : C.redSoft }]}>{used ? <Check size={20} color={C.green} /> : <Trash2 size={20} color={C.red} />}</View>
              <View style={{ flex: 1 }}><Text style={s.cardTitle}>{name}</Text><Text style={s.footnote}>{t(used ? 'history.usedOn' : 'history.tossedOn', { date: i18n.date(item.closedAt!) })}{item.product.source === 'sample' ? ` · ${t('source.sample')}` : ''}</Text></View>
              <Tap accessibilityRole="button" accessibilityLabel={t('history.putBackLabel', { name })} haptic={null} onPress={() => void setPantryStatus(item.id, 'active')} style={s.iconButton} pressedStyle={{ backgroundColor: C.pale }}><Undo2 size={18} color={C.green} /></Tap>
              <Tap accessibilityRole="button" accessibilityLabel={t('history.deleteLabel', { name })} haptic={null} onPress={() => void deletePantryItem(item.id)} style={s.iconButton} pressedStyle={{ backgroundColor: C.redSoft }}><X size={18} color={C.red} /></Tap>
            </View>; })}</>}
        {page === 'settings' && <><Text accessibilityRole="header" style={s.pageTitle}>{t('settings.title')}</Text><Text style={s.body}>{t('settings.body')}</Text>
          {!settingsReady && <Notice>{t('settings.saveFirst')}</Notice>}
          {feedback ? <Reveal trigger={feedback}><View testID="settings-feedback" accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
          <View style={s.card}><Text style={s.cardTitle}>{t('settings.yourName')}</Text><Text style={s.bodySmall}>{t('settings.yourNameHelp', { you: t('common.you') })}</Text>
            <TextInput accessibilityLabel={t('settings.yourName')} style={s.input} value={nameDraft} onChangeText={setNameDraft} placeholder={t('common.you')} placeholderTextColor={C.faint} maxLength={40} editable={settingsReady && !settingsBusy} onSubmitEditing={() => void saveMyName()} />
            {cleanName(nameDraft) !== myName && <Button loading={settingsBusy} disabled={!settingsReady} onPress={saveMyName}>{t('settings.saveName')}</Button>}</View>
          <View style={s.card}><View style={s.between}><Text style={s.cardTitle}>{t('settings.household')}</Text><Text style={s.footnote}>{t('settings.count', { n: people.length, max: MAX_MEMBERS + 1 })}</Text></View>
            <View style={s.memberRow}><View style={[s.personAvatar, { backgroundColor: C.green }]}><Text accessible={false} style={s.personInitial}>{Array.from(myName || t('common.you'))[0].toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{myName || t('common.you')} <Text style={s.footnote}>{t('settings.youTag')}</Text></Text><Text style={s.footnote}>{allergies.length ? allergyList(allergies, ' · ') : t('settings.noAllergies')}</Text></View><Tap accessibilityRole="button" accessibilityLabel={t('settings.editYours')} haptic="select" onPress={() => navigate('allergies')} style={s.iconButton} pressedStyle={{ backgroundColor: C.pale }}><Pencil size={17} color={C.green} /></Tap></View>
            {members.map(m => editing?.id === m.id ? <View key={m.id}>{memberForm}</View> : <View key={m.id} style={{ gap: 10 }}><View style={s.memberRow}><View style={[s.personAvatar, { backgroundColor: C.blue }]}><Text accessible={false} style={s.personInitial}>{m.name.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{m.name}</Text><Text style={s.footnote}>{allergyList(m.allergies, ' · ')}</Text></View>
              <Tap accessibilityRole="button" accessibilityLabel={t('member.edit', { name: m.name })} haptic="select" disabled={settingsBusy} onPress={() => { setFeedback(''); setRemoving(null); setEditing({ id: m.id, name: m.name, allergies: [...m.allergies] }); }} style={s.iconButton} pressedStyle={{ backgroundColor: C.pale }}><Pencil size={17} color={C.green} /></Tap>
              <Tap accessibilityRole="button" accessibilityLabel={t('member.removeLabel', { name: m.name })} haptic="warning" disabled={settingsBusy} onPress={() => { setFeedback(''); setEditing(null); setRemoving(m.id); }} style={s.iconButton} pressedStyle={{ backgroundColor: C.redSoft }}><Trash2 size={17} color={C.red} /></Tap></View>
              {removing === m.id && <Reveal style={{ gap: 10 }}><Notice kind="danger">{t('member.removeConfirm', { name: m.name })}{defaultView === m.id ? ` ${t('member.removeDefault')}` : ''}</Notice><View style={s.actionRow}><View style={{ flex: 1 }}><Button variant="danger" hapticKind="warning" loading={settingsBusy} onPress={() => void removeMember(m.id)}>{t('member.remove', { name: m.name })}</Button></View><Button secondary onPress={() => setRemoving(null)}>{t('member.keep')}</Button></View></Reveal>}</View>)}
            {editing && !editing.id ? memberForm
              : !editing && members.length < MAX_MEMBERS && <Button secondary disabled={!settingsReady || settingsBusy} onPress={() => { setFeedback(''); setRemoving(null); setEditing({ id: null, name: '', allergies: [] }); }} icon={<Plus accessible={false} size={18} color={C.green} />}>{t('member.add')}</Button>}
            {members.length >= MAX_MEMBERS && !editing && <Text style={s.footnote}>{t('settings.full', { n: MAX_MEMBERS })}</Text>}</View>
          <View style={s.card}><Text style={s.cardTitle}>{t('settings.showFor')}</Text><Text style={s.bodySmall}>{t('settings.showForHelp')}</Text>
            <View accessibilityRole="radiogroup" style={{ gap: 6 }}>{(household ? viewOptions : viewOptions.filter(o => o.id === ME)).map(o => { const on = defaultView === o.id || (!household && o.id === ME); return <Tap key={o.id} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on, disabled: !settingsReady || settingsBusy }} accessibilityLabel={t('settings.defaultLabel', { label: o.label })} haptic={null} disabled={!settingsReady || settingsBusy} onPress={() => void chooseDefault(o.id)} style={[s.radioRow, on && s.allergySelected]} pressedStyle={!on && { backgroundColor: C.pale }}><View style={[s.radioDot, on && s.radioDotOn]} /><Text style={[s.navText, { flex: 1 }]}>{o.label}</Text></Tap>; })}</View>
            {!household && <Text style={s.footnote}>{t('settings.addToChoose', { everyone: t('view.everyone', { n: 1 }).replace(/\s*\(.*\)$/, '') })}</Text>}</View>
          <View testID="language-settings" style={s.card}><View style={s.inline}><Languages size={20} color={C.green} /><Text style={s.cardTitle}>{t('settings.language')}</Text></View><Text style={s.bodySmall}>{t('settings.languageHelp')}</Text>
            <View accessibilityRole="radiogroup" style={{ gap: 6 }}>{LANGUAGES.map(l => { const on = lang === l.code; return <Tap key={l.code} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on, disabled: settingsBusy }} accessibilityLabel={t('settings.languageLabel', { name: l.name })} accessibilityLanguage={l.locale} haptic={null} disabled={settingsBusy} onPress={() => void chooseLanguage(l.code)} style={[s.radioRow, on && s.allergySelected]} pressedStyle={!on && { backgroundColor: C.pale }}><View style={[s.radioDot, on && s.radioDotOn]} /><Text style={[s.navText, { flex: 1 }]}>{l.name}</Text>{on && <Check size={18} color={C.green} />}</Tap>; })}</View>
            {lang !== 'en' && <Text style={s.footnote}>{t('settings.translationNote')}</Text>}</View>
          <View testID="appearance-settings" style={s.card}><View style={s.inline}><SunMoon size={20} color={C.green} /><Text style={s.cardTitle}>{t('settings.appearance')}</Text></View><Text style={s.bodySmall}>{t('settings.appearanceHelp')}</Text>
            <View accessibilityRole="radiogroup" style={{ gap: 6 }}>{APPEARANCES.map(a => { const on = appearance === a; return <Tap key={a} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={t('settings.appearanceLabel', { name: t(`settings.appearance.${a}`) })} haptic="select" onPress={() => setAppearance(a)} style={[s.radioRow, on && s.allergySelected]} pressedStyle={!on && { backgroundColor: C.pale }}><View style={[s.radioDot, on && s.radioDotOn]} /><Text style={[s.navText, { flex: 1 }]}>{t(`settings.appearance.${a}`)}</Text>{on && <Check size={18} color={C.green} />}</Tap>; })}</View></View>
          <Tap accessibilityRole="button" haptic="select" onPress={() => navigate('about')} style={[s.card, s.historyRow]} pressedStyle={{ borderColor: C.green }}><BookOpen size={20} color={C.green} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>{t('settings.appDetails')}</Text><Text style={s.footnote}>{t('settings.appDetailsBody')}</Text></View><ChevronRight size={20} color={C.green} /></Tap></>}
        {page === 'about' && <><Text accessibilityRole="header" style={s.pageTitle}>{t('about.title')}</Text>
          <View style={s.card}><View style={s.iconTile}><ShieldCheck size={24} color={C.green} /></View><Text style={s.sectionTitle}>{t('about.profileTitle')}</Text><Text style={s.body}>{t('about.profileBody1')}</Text><Text style={s.body}>{t('about.profileBody2')}</Text></View>
          <View style={s.card}><Text style={s.cardTitle}>{t('about.sourcesTitle')}</Text><Text style={s.body}>{t('about.sourcesBody')}</Text><Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL('https://fdc.nal.usda.gov')}><Text style={s.link}>{t('about.usdaLink')}</Text></Tap><Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL('https://world.openfoodfacts.org')}><Text style={s.link}>{t('about.offLink')}</Text></Tap><Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL('https://opendatacommons.org/licenses/odbl/1-0/')}><Text style={s.link}>{t('about.license')}</Text></Tap></View>
          <View style={s.card}><Text style={s.cardTitle}>{t('legal.title')}</Text>{lang !== 'en' && <Text style={s.footnote}>{t('legal.english')}</Text>}{(['disclaimer', 'privacy', 'terms'] as const).map(name => <Tap key={name} accessibilityRole="link" haptic="select" onPress={() => openLegal(name)}><Text style={s.link}>{t(`legal.${name}`)}</Text></Tap>)}</View>
          <View style={[s.card, { backgroundColor: C.pale }]}><Sparkles size={25} color={C.green} /><Text style={s.cardTitle}>{t('about.nextTitle')}</Text><Text style={s.body}>{t('about.nextBody')}</Text></View>
          <View style={s.card}><Text style={s.cardTitle}>{t('about.sessionTitle')}</Text><Text style={s.bodySmall}>{demo ? t('about.sessionDemo') : t('about.sessionCloud')}</Text><Button secondary disabled={busy || saving} onPress={leave} icon={<LogOut accessible={false} size={17} color={C.ink} />}>{demo ? t('about.exitDemo') : t('about.signOut')}</Button>
            {!demo && <>{deleteConfirm ? <Reveal style={{ gap: 12 }}><Notice kind="danger">{t('about.deleteConfirm')}</Notice><Button variant="danger" hapticKind="warning" loading={saving} onPress={deleteAccount}>{saving ? t('about.deleting') : t('about.confirmDelete')}</Button><Button secondary onPress={() => setDeleteConfirm(false)}>{t('about.cancelDelete')}</Button></Reveal> : <Tap accessibilityRole="button" haptic="warning" onPress={() => setDeleteConfirm(true)}><Text style={[s.link, { color: C.red }]}>{t('about.delete')}</Text></Tap>}</>}</View></>}
        <View style={s.footer}><Leaf size={15} color={C.muted} /><Tap accessibilityRole="link" accessibilityHint={t('legal.disclaimer')} haptic="select" onPress={() => openLegal('disclaimer')} style={{ flexShrink: 1 }}><Text style={s.footnote}>{t('footer.disclaimer')}</Text></Tap><Text style={s.footnote}>{t('footer.version')}</Text></View>
      </ScrollView>
      {page === 'allergies' && <View style={s.profileActions}>
        <Text accessibilityLiveRegion="polite" style={[s.bodySmall, profileChanged && { color: C.amber, fontWeight: '600' }]}>{t('allergies.count', { n: draft.length, total: ALLERGENS.length })} · {profileChanged ? t('allergies.unsaved') : t('allergies.saved')}</Text>
        <View accessible={false} style={s.progressTrack}><View style={[s.progressFill, { width: `${(draft.length / ALLERGENS.length) * 100}%` }]} /></View>
        {saving ? <Reveal><View accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.saveConfirmation}><ActivityIndicator color={C.green} /><Text style={[s.bodySmall, { flex: 1 }]}>{t('allergies.saving')}</Text></View></Reveal>
          : feedback ? <Reveal trigger={feedback}><View testID="profile-save-feedback" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.saveConfirmation, { backgroundColor: tone[feedbackTone].bg }]}>{profileSaved ? <CheckMark checked round /> : <CircleAlert accessible={false} size={24} color={tone[feedbackTone].fg} />}<View style={{ flex: 1 }}>{profileSaved && <Text style={s.cardTitle}>{t('allergies.profileSaved')}</Text>}<Text style={[s.bodySmall, { color: tone[feedbackTone].fg }]}>{feedback}</Text></View></View></Reveal> : null}
        <View style={s.actionRow}><View style={{ flex: 1 }}><Button onPress={saveAllergies} hapticKind="firm" loading={saving} disabled={!profileReady}>{saving ? t('allergies.savingShort') : t('allergies.save')}</Button></View>{profileChanged && <Button secondary disabled={saving} icon={<RotateCcw accessible={false} size={17} color={C.ink} />} onPress={() => { setDraft([...allergies]); setProfileSaved(false); setFeedback(''); toast(t('toast.discarded'), 'info'); }}>{t('allergies.reset')}</Button>}</View>
      </View>}
      {!wide && <View style={s.mobileNavWrap}><View style={s.mobileNav}>{mobileNavItems.map(item => { const active = page === item.page; return <Tap key={item.page} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} haptic="select" scaleTo={.9} onPress={() => navigate(item.page)} style={s.mobileNavItem}>
        <View style={s.mobileNavIcon}><Icon name={item.page} color={active ? C.green : C.muted} />{item.page === 'pantry' && alertCount > 0 && <View accessible={false} style={s.navBadge} />}</View><Text style={[s.mobileNavText, active && { color: C.green, fontWeight: '600' }]}>{item.short}</Text>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandText: { color: C.ink, fontSize: 23, fontWeight: '800', letterSpacing: -1 },
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
  link: { ...type.subhead, color: C.green, fontWeight: '600', minHeight: 44, paddingVertical: 11 }, consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, legalRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 },
  allergyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, allergyOption: { minHeight: 56, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: C.paper }, allergySelected: { borderColor: C.green },
  allergenMark: { minWidth: 40, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, overflow: 'hidden', fontSize: 14, color: C.green, backgroundColor: C.pale, fontWeight: '800' },
  scannerPlaceholder: { alignItems: 'center', gap: 14, paddingVertical: 22, paddingHorizontal: 14, backgroundColor: C.fill, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong },
  cameraFrame: { width: '100%', aspectRatio: 1, maxHeight: 420, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }, cameraGuide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 12 }, cameraTarget: { width: '76%', height: '34%', borderWidth: 3, borderColor: C.lime, borderRadius: 16 }, cameraGuideText: { color: 'white', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, overflow: 'hidden' },
  sampleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, borderBottomWidth: 1, borderColor: C.border }, sampleSwatch: { padding: 7, borderRadius: 9 },
  resultCard: { boxShadow: '0px 10px 30px rgba(23,51,43,0.08)' }, sourceBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden' }, closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: C.pale },
  resultBanner: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 18, marginVertical: 6 }, resultIcon: { alignSelf: 'flex-start', padding: 9, borderRadius: 14 }, resultTitle: { ...type.title3, fontWeight: '700' },
  matchChip: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden', backgroundColor: C.paper }, detailBlock: { gap: 4 }, viewChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.separator, backgroundColor: C.paper }, viewChipOn: { backgroundColor: C.green, borderColor: C.green }, viewChipText: { ...type.subhead, fontWeight: '600', color: C.muted }, personCard: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 }, personAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, personInitial: { color: C.onAccent, fontWeight: '800', fontSize: 16 }, personVerdict: { ...type.subhead, fontWeight: '700', marginTop: 4 }, memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 }, memberForm: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: C.pale }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.fill }, radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.borderStrong }, radioDotOn: { borderColor: C.green, borderWidth: 6 }, evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }, evidenceAllergen: { fontSize: 13, fontWeight: '800', minWidth: 72 }, ingredientHit: { color: C.red, backgroundColor: C.redSoft, fontWeight: '800', textDecorationLine: 'underline' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  pantryAdd: { gap: 10, padding: 16, borderRadius: 18, backgroundColor: C.pale }, hiddenTag: { ...type.footnote, color: C.red, fontWeight: '700' },
  pantryCard: { gap: 12, padding: 14 }, pantryMain: { flexDirection: 'row', alignItems: 'center', gap: 12 }, pantryBadge: { alignSelf: 'flex-start', backgroundColor: C.amberSoft, color: C.amber },
  pantryAction: { flexGrow: 1, flexBasis: '40%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999 }, pantryActionText: { ...type.subhead, fontWeight: '700' },
  navBadge: { position: 'absolute', top: 0, right: '-15%', width: 9, height: 9, borderRadius: 5, backgroundColor: C.red, borderWidth: 1.5, borderColor: C.paper },
  navCount: { marginLeft: 'auto', minWidth: 22, textAlign: 'center', ...type.caption, fontWeight: '800', color: C.onAccent, backgroundColor: C.red, borderRadius: 11, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 }, empty: { alignItems: 'center', paddingVertical: 44 },
  mobileNavWrap: { paddingHorizontal: '4%', paddingTop: 6, paddingBottom: 8, backgroundColor: C.bg },
  groupedList: { backgroundColor: C.paper, borderRadius: 22, overflow: 'hidden', rowGap: 0 }, groupedRow: { width: '100%', borderRadius: 0, borderWidth: 0 }, groupedSeparator: { borderBottomWidth: 1, borderBottomColor: C.separator },
  mobileNav: { flexDirection: 'row', backgroundColor: C.paper, borderRadius: 999, borderWidth: 1, borderColor: C.separator, paddingVertical: 4, paddingHorizontal: 4, boxShadow: '0px 8px 24px rgba(23,51,43,0.12)' }, mobileNavItem: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 2 }, mobileNavIcon: { paddingVertical: 2 }, mobileNavText: { textAlign: 'center', fontSize: 11, lineHeight: 13, fontWeight: '500', color: C.muted },
}));
