import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowUpRight, BookOpen, Camera, ChevronRight, CircleAlert, CircleQuestionMark, Clock3, Info, Leaf, LockKeyhole, LogOut, RotateCcw, ScanBarcode, Search, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert, UserRound, X } from 'lucide-react-native';
import type { Session } from '@supabase/supabase-js';
import { ALLERGENS, AllergenId, assess, Assessment, Product, validBarcode } from './src/domain/allergens';
import { lookupProduct, SAMPLES } from './src/data/products';
import { cloudConfigured, supabase } from './src/lib/supabase';
import { C, shadow, Tone, tone } from './src/ui/theme';
import { haptic } from './src/ui/haptics';
import { Button, CheckMark, Notice, Reveal, Skeleton, Tap, ToastProvider, useToast } from './src/ui/controls';

type Page = 'overview' | 'scan' | 'allergies' | 'history' | 'about';
type Entry = { product: Product; at: string };
const Icon = ({ name, size = 21, color = C.muted }: { name: Page; size?: number; color?: string }) => {
  const Component = { overview: Leaf, scan: ScanBarcode, allergies: SlidersHorizontal, history: Clock3, about: BookOpen }[name];
  return <Component accessible={false} size={size} color={color} strokeWidth={1.9} />;
};
// "No match" is deliberately informational blue with a neutral haptic, never a green check or success buzz: it is not a safety verdict.
const RESULT: Record<Assessment['kind'], { tone: Tone; Icon: typeof Info; haptic: 'error' | 'warning' | 'tap' }> = {
  contains: { tone: 'danger', Icon: CircleAlert, haptic: 'error' }, traces: { tone: 'warning', Icon: TriangleAlert, haptic: 'warning' },
  unknown: { tone: 'warning', Icon: CircleQuestionMark, haptic: 'warning' }, 'no-match': { tone: 'info', Icon: Info, haptic: 'tap' },
};
const SAMPLE_ART = [{ bg: '#EDE5D2', pack: '#B38B58', word: 'CRUNCH' }, { bg: '#ECE0DA', pack: '#6E4F43', word: 'COCOA' }, { bg: '#E4EBCD', pack: '#84965A', word: 'OATS' }, { bg: '#E7E9E3', pack: '#9DA597', word: '?' }];
const allergyLabel = (id: AllergenId) => ALLERGENS.find(a => a.id === id)?.label;
const reportedTags = (tags: string[]) => tags.map(tag => tag.trim().replace(/^[a-z]{2}:/i, '').replace(/-/g, ' ').toUpperCase()).join(', ');
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
    setHistory([]); setProduct(null); setCamera(false); setProfileReady(false); setAllergies([]); setDraft([]);
    if (!session || !supabase || demo) return;
    supabase.from('profiles').select('allergies').eq('id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (generation.current !== current) return;
      if (error) { haptic.error(); say('Could not load your allergy profile. Sign out and retry; scanning remains locked.', 'danger'); return; }
      const selected = Array.isArray(data?.allergies) ? data.allergies.filter((id: AllergenId) => ALLERGENS.some(a => a.id === id)) : [];
      setAllergies(selected); setDraft(selected); setProfileReady(true); setPage(selected.length ? 'overview' : 'allergies');
      toast(selected.length ? 'Signed in · profile loaded' : 'Signed in · choose your allergies to start');
    });
  }, [session?.user.id]);

  const enterDemo = () => {
    ++generation.current; setDemo(true); setAllergies(['milk', 'peanuts']); setDraft(['milk', 'peanuts']);
    setProfileReady(true); setHistory([]); setProduct(null); setFeedback(''); setEmail(''); setPassword(''); setPage('overview');
    haptic.success(); toast('Demo ready · Milk and Peanuts preselected');
  };
  const navigate = (next: Page) => { setCamera(false); setPage(next); setProfileSaved(false); setFeedback(''); setDeleteConfirm(false); };
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
    haptic[RESULT[assess(next, allergies).kind].haptic]();
    pendingScroll.current = true;
    setProduct(next); setHistory(prev => [{ product: next, at: new Date().toISOString() }, ...prev].slice(0, 30)); setPage('scan'); setFeedback(''); setCamera(false);
    toast(`Checked against your ${allergies.length} saved allerg${allergies.length === 1 ? 'y' : 'ies'}`, 'info');
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
    ++generation.current; setDemo(false); setSession(null); setProfileReady(false); setAllergies([]); setDraft([]); setHistory([]); setProduct(null); setFeedback(''); setPage('overview');
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
    ++generation.current; setSession(null); setAllergies([]); setDraft([]); setHistory([]); setProduct(null); setProfileReady(false); setDeleteConfirm(false); say('Account and allergy profile deleted.', 'success');
  };
  const assessment = product ? assess(product, allergies) : null;
  const canScan = profileReady && allergies.length > 0;
  const profileChanged = draft.length !== allergies.length || draft.some(id => !allergies.includes(id));
  const inlineScanFeedback = page === 'scan' && canScan;
  const hint = barcodeHint(barcode);

  if (booting) return <View style={s.loading}><View style={[s.logo, { padding: 14 }]}><Leaf size={32} color="white" /></View><ActivityIndicator color={C.green} /><Text style={s.body}>Opening PantryCheck…</Text></View>;
  if (!demo && !session) return <SafeAreaView style={s.root}><StatusBar style="dark" /><ScrollView contentContainerStyle={s.welcome} keyboardShouldPersistTaps="handled">
    <View style={[s.welcomeBrand, wide && { width: '48%' }]}>
      <View style={s.brand}><View style={s.logo}><Leaf size={25} color="white" /></View><Text style={s.brandText}>pantrycheck<Text style={{ color: '#8FAD71' }}>.</Text></Text></View>
      <Text style={s.eyebrow}>A LITTLE CLARITY IN EVERY AISLE</Text>
      <Text style={[s.welcomeTitle, { fontSize: wide ? 58 : 40, lineHeight: wide ? 64 : 46 }]}>Know more.{'\n'}Shop with{'\n'}your allergies{'\n'}in mind.</Text>
      <Text style={[s.body, { maxWidth: 430 }]}>Scan a barcode. See how reported ingredients match your allergy profile. Keep the final check on the label.</Text>
      <View style={s.welcomeChips}><Text style={s.smallPill}>9 US major allergens</Text><Text style={s.smallPill}>Private by design</Text></View>
      <View style={s.welcomeGraphic}><View style={s.welcomeIcon}><ScanBarcode size={54} color={C.green} strokeWidth={1.3} /></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>Your next shop, better informed.</Text><Text style={s.bodySmall}>Barcode first. Label always.</Text></View></View>
    </View>
    <View style={[s.authCard, wide && { width: '39%' }]}>
      <Text style={s.eyebrow}>WELCOME TO PANTRYCHECK</Text><Text style={s.sectionTitle}>{authMode === 'signup' ? 'Make it personal.' : 'Welcome back.'}</Text>
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

  const navItems: { page: Page; label: string; short: string }[] = [{ page: 'overview', label: 'Overview', short: 'Home' }, { page: 'scan', label: 'Scan a product', short: 'Scan' }, { page: 'allergies', label: 'My allergies', short: 'Allergies' }, { page: 'history', label: 'Recent scans', short: 'History' }, { page: 'about', label: 'App details', short: 'Details' }];
  const result = product && assessment ? RESULT[assessment.kind] : null;
  return <SafeAreaView style={s.root}><StatusBar style="dark" /><View style={s.appFrame}>
    {wide && <View style={s.sidebar}>
      <View style={s.brand}><View style={s.logo}><Leaf size={24} color="white" /></View><Text style={s.brandText}>pantrycheck.</Text></View>
      <Text style={[s.eyebrow, { marginTop: 44, marginBottom: 14 }]}>YOUR EVERYDAY COMPANION</Text>
      {navItems.map(item => { const active = page === item.page; return <Tap key={item.page} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} haptic="select" scaleTo={.98} onPress={() => navigate(item.page)} style={[s.navItem, active && s.navActive]} pressedStyle={!active && { backgroundColor: C.pale }}>
        <Icon name={item.page} color={active ? C.green : C.muted} /><Text style={[s.navText, active && { color: C.green, fontWeight: '700' }]}>{item.label}</Text>{active && <View style={s.navDot} />}
      </Tap>; })}
      <View style={{ flex: 1 }} /><View style={s.sidebarNote}><ShieldCheck size={27} color={C.green} /><Text style={s.cardTitle}>Label first. Always.</Text><Text style={s.bodySmall}>We help you spot signals. The package is your final source.</Text></View>
      <Tap accessibilityRole="button" disabled={busy || saving} onPress={leave} style={s.account} pressedStyle={{ opacity: .7 }}><View style={s.avatar}><UserRound size={19} color={C.green} /></View><View style={{ flex: 1 }}><Text style={s.navText}>{demo ? 'Demo explorer' : 'Your account'}</Text><Text style={s.footnote}>{demo ? 'Local preview session' : 'Private allergy profile'}</Text></View><LogOut size={18} color={C.muted} /></Tap>
    </View>}
    <View style={s.main}>
      <View style={s.topbar}>
        <View style={[s.inline, { flexShrink: 1 }]}>{!wide && <View style={[s.logo, { padding: 5, borderRadius: 9 }]}><Leaf size={16} color="white" /></View>}<Text style={s.breadcrumb}>{wide ? 'Your pantry companion' : 'pantrycheck.'}<Text style={{ color: C.faint }}>  /  </Text><Text style={{ color: C.ink, fontWeight: '600' }}>{navItems.find(n => n.page === page)?.label}</Text></Text></View>
        <View style={s.modeBadge}><View style={[s.navDot, { marginLeft: 0 }]} /><Text style={s.modeText}>{demo ? 'DEMO MODE' : 'CONNECTED'}</Text></View>
      </View>
      <ScrollView ref={scrollRef} key={page} testID="page-scroll" style={s.pageScroll} contentContainerStyle={[s.content, !wide && { padding: 18, gap: 20 }]} keyboardShouldPersistTaps="handled">
        {demo && <View style={s.demoBar}><View style={[s.inline, { flexShrink: 1 }]}><Sparkles accessible={false} size={15} color={C.amber} /><Text style={[s.bodySmall, { color: C.amber, flexShrink: 1 }]}>Employer preview · fictional samples + live barcode lookup · nothing saved</Text></View><Tap accessibilityRole="button" onPress={leave} disabled={busy || saving} style={s.demoExit} pressedStyle={{ backgroundColor: '#F3E3BD' }}><Text style={[s.textLink, { color: C.amber }]}>Exit demo ↗</Text></Tap></View>}
        {feedback && page !== 'allergies' && !inlineScanFeedback ? <Reveal trigger={feedback}><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
        {!profileReady && !demo && <Notice>Allergy profile loading or unavailable. Scanning stays locked until your profile is ready.</Notice>}
        {page === 'overview' && <>
          <View style={s.titleRow}><View style={{ flex: 1 }}><Text style={s.eyebrow}>SMALL CHECK. MORE CLARITY.</Text><Text accessibilityRole="header" style={s.pageTitle}>Good food starts with a check.</Text><Text style={s.body}>A clearer view of what’s in your next bite.</Text></View>{wide && <View style={s.roundLeaf}><Leaf size={28} color={C.green} /></View>}</View>
          <View style={[s.hero, !wide && { flexDirection: 'column' }]}><View style={[s.heroCopy, !wide && { padding: 24 }]}><Text style={s.heroEyebrow}>MEET YOUR SHOPPING SIDEKICK</Text><Text style={[s.heroTitle, !wide && { fontSize: 29, lineHeight: 35 }]}>One scan.{'\n'}A more informed choice.</Text><Text style={s.heroBody}>Match reported ingredients to your allergies, right from the grocery aisle.</Text>
            <View style={{ alignSelf: 'flex-start' }}><Tap accessibilityRole="button" haptic="firm" onPress={() => navigate(canScan ? 'scan' : 'allergies')} style={s.limeButton} pressedStyle={{ backgroundColor: '#C6E26C' }}><ScanBarcode size={20} color={C.ink} /><Text style={s.limeButtonText}>{canScan ? 'Scan a barcode' : 'Set up allergies'}</Text><ArrowUpRight size={18} color={C.ink} /></Tap></View><Text style={s.heroCaption}>Always confirm with the physical package label.</Text></View>
            <View style={[s.heroArt, !wide && { display: 'none' }]}><View style={s.scanIllustration}><View style={s.inline}><View style={s.tinyLeaf}><Leaf size={18} color={C.green} /></View><Text style={s.labelMini}>PANTRY CHECK</Text></View><View style={s.packageIllustration}><Text style={s.packageBrand}>everyday</Text><Text style={s.packageName}>OAT{'\n'}CRACKERS</Text><Leaf size={42} color="#778749" strokeWidth={1} /><Text style={s.packageBottom}>FICTIONAL PACKAGING</Text></View><View style={s.illustrationBarcode}><ScanBarcode size={60} color={C.ink} /><Text style={s.footnote}>Scan. Compare. Read the label.</Text></View></View></View>
          </View>
          <View style={[s.columns, !wide && { flexDirection: 'column' }]}>
            <View style={[s.card, { flex: 1.2 }]}><View style={s.between}><Text style={s.cardTitle}>Your allergy profile</Text><Tap accessibilityRole="button" haptic="select" onPress={() => navigate('allergies')} style={s.pillLink} pressedStyle={{ backgroundColor: C.greenSoft }}><Text style={s.textLink}>Edit profile ↗</Text></Tap></View><Text style={s.bodySmall}>Every check is personal to you.</Text><View style={s.chips}>{allergies.map(id => <View key={id} style={s.allergyChip}><View style={s.chipDot} /><Text style={s.chipText}>{allergyLabel(id)}</Text></View>)}</View><View style={s.divider} /><View style={s.inline}><ShieldCheck size={16} color={C.green} /><Text style={s.bodySmall}>{allergies.length} selected · {demo ? 'Local session only' : 'Private to your account'}</Text></View></View>
            <View style={[s.card, { flex: 1 }]}><View style={s.between}><Text style={s.cardTitle}>Made for real life.</Text><View style={s.iconTile}><ScanBarcode size={21} color={C.green} /></View></View>{['Scan a packaged food barcode', 'Review your personal allergen signals', 'Double-check the package label'].map((line, i) => <View key={line} style={s.step}><Text style={s.stepNumber}>{i + 1}</Text><Text style={[s.bodySmall, { flex: 1 }]}>{line}</Text></View>)}</View>
          </View>
          <View style={s.between}><View><Text style={s.sectionTitle}>Give it a try</Text><Text style={s.bodySmall}>Four fictional products. Four useful outcomes.</Text></View><Text style={s.sampleLabel}>DEMO COLLECTION</Text></View>
          <View style={[s.sampleGrid, !wide && { flexDirection: 'column' }]}>{SAMPLES.map((item, i) => <Tap accessibilityRole="button" accessibilityLabel={`Try ${item.name}`} disabled={!canScan} key={item.barcode} haptic={null} onPress={() => showProduct(item)} style={[s.sampleCard, !canScan && { opacity: .5 }]} pressedStyle={{ borderColor: C.green }}>
            <View style={[s.sampleArt, { backgroundColor: SAMPLE_ART[i].bg }]}><Text style={s.sampleNumber}>0{i + 1}</Text><View style={[s.miniPack, { backgroundColor: SAMPLE_ART[i].pack }]}><Leaf size={19} color="white" /><Text style={s.miniPackText}>{SAMPLE_ART[i].word}</Text></View><ArrowUpRight size={17} color={C.muted} /></View>
            <View style={s.sampleInfo}><Text style={s.sampleName}>{item.name}</Text><View style={s.between}><Text style={s.footnote}>Fictional sample</Text><ChevronRight size={16} color={C.green} /></View></View>
          </Tap>)}</View>
        </>}
        {page === 'allergies' && <>
          <Text style={s.eyebrow}>PERSONALIZE YOUR CHECKS</Text><Text accessibilityRole="header" style={s.pageTitle}>Your allergies, front and center.</Text><Text style={s.body}>Choose from the nine US major food allergens. Select all that apply.</Text>
          <Notice kind="info">This app does not cover every allergy. Wheat is not a gluten or celiac-disease check. Crustacean shellfish does not cover mollusks.</Notice>
          <View style={s.allergyGrid}>{ALLERGENS.map(a => { const on = draft.includes(a.id); return <Tap key={a.id} accessibilityRole="checkbox" aria-checked={on} aria-disabled={saving || !profileReady} accessibilityLabel={a.label} accessibilityHint="Changes apply after saving your allergy profile." accessibilityState={{ checked: on, disabled: saving || !profileReady }} disabled={saving || !profileReady} haptic="select" scaleTo={.98}
            onPress={() => { setProfileSaved(false); setFeedback(''); setDraft(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]); }}
            style={[s.allergyOption, { width: singleColumn ? '100%' : '48.5%' }, on && s.allergySelected]} pressedStyle={!on && { backgroundColor: C.pale }}>
            <Text accessible={false} style={[s.allergenMark, on && { backgroundColor: C.green, color: 'white' }]}>{a.mark}</Text><Text style={[s.cardTitle, { flex: 1 }, on && { color: C.greenDeep }]}>{a.label}</Text><CheckMark checked={on} />
          </Tap>; })}</View>
        </>}
        {page === 'scan' && <>
          <Text style={s.eyebrow}>CHECK BEFORE YOU CHOOSE</Text><Text accessibilityRole="header" style={s.pageTitle}>What’s in your next bite?</Text><Text style={s.body}>Scan a food barcode or enter the numbers beneath it.</Text>
          {!canScan ? <Button onPress={() => navigate('allergies')}>Choose your allergies</Button> : <View style={[s.columns, !wide && { flexDirection: 'column' }]}><View style={[s.card, { flex: 1 }]}>
            <View style={s.inline}><View style={s.iconTile}><ScanBarcode size={19} color={C.green} /></View><Text style={s.cardTitle}>Barcode scanner</Text></View>
            {camera && permission?.granted ? <View style={{ gap: 12 }}><View style={s.cameraFrame}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={event => { if (event.type === 'upc_e') { setCamera(false); haptic.warning(); say('UPC-E needs expansion. Enter the full UPC barcode or try another product.'); } else void scan(event.data, true); }} /><View pointerEvents="none" style={s.cameraGuide}><View style={s.cameraTarget} /><Text style={s.cameraGuideText}>Center the barcode inside the frame</Text></View></View><Button secondary onPress={() => setCamera(false)} icon={<X accessible={false} size={18} color={C.ink} />}>Close camera</Button></View>
              : <View style={s.scannerPlaceholder}><ScanBarcode size={60} color={C.green} strokeWidth={1.2} /><Text style={[s.bodySmall, { textAlign: 'center' }]}>{Platform.OS === 'web' ? 'Phone camera scanning in iOS / Android app.' : 'Point your camera at a UPC or EAN barcode.'}</Text><Button disabled={busy || Platform.OS === 'web'} loading={cameraAsking} onPress={openCamera} icon={<Camera accessible={false} size={18} color="white" />}>Open camera</Button></View>}
            <Text style={s.label}>Or enter barcode manually</Text>
            <TextInput accessibilityLabel="Barcode number" style={[s.input, barcodeFocused && s.inputFocused, hint.ok && { borderColor: C.green }]} value={barcode} onChangeText={value => { setBarcode(value); if (feedback) setFeedback(''); }} onFocus={() => setBarcodeFocused(true)} onBlur={() => setBarcodeFocused(false)} keyboardType="number-pad" maxLength={14} placeholder="e.g. 3017620422003" placeholderTextColor={C.faint} onSubmitEditing={() => void scan(barcode)} editable={!busy} />
            <Text style={[s.footnote, hint.ok && { color: C.green, fontWeight: '600' }]}>{hint.text}</Text>
            <Button loading={busy} onPress={() => void scan(barcode)} icon={<Search accessible={false} size={18} color="white" />}>{busy ? 'Checking product…' : 'Look up product'}</Button>
            {feedback && inlineScanFeedback ? <Reveal trigger={feedback}><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Notice kind={feedbackTone}>{feedback}</Notice></View></Reveal> : null}
            <Text style={s.footnote}>Manufacturer-submitted USDA FoodData Central records first; community Open Food Facts only if USDA has no match. Always compare with the package.</Text>
          </View><View style={[s.card, { flex: 1 }]}><Text style={s.cardTitle}>Try a sample instead</Text><Text style={s.bodySmall}>Fictional examples for your presentation. These never replace a live lookup.</Text>
            <View>{SAMPLES.map((item, i) => <Tap accessibilityRole="button" accessibilityLabel={item.name} disabled={busy} key={item.barcode} haptic={null} scaleTo={.98} onPress={() => showProduct(item)} style={s.sampleRow} pressedStyle={{ backgroundColor: C.pale }}><View style={[s.sampleSwatch, { backgroundColor: SAMPLE_ART[i].pack }]}><Leaf size={14} color="white" /></View><Text style={[s.navText, { flex: 1 }]}>{item.name}</Text><ChevronRight size={18} color={C.green} /></Tap>)}</View>
            <View style={s.inline}><LockKeyhole size={15} color={C.muted} /><Text style={[s.footnote, { flex: 1 }]}>Only barcode sent to the product provider. Allergy matching happens on your device.</Text></View></View></View>}
          {(busy || (product && assessment)) && <View onLayout={e => { if (pendingScroll.current) { pendingScroll.current = false; scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: true }); } }}>
            {busy ? <Reveal style={s.card}><View accessibilityRole="progressbar" aria-busy accessibilityLabel="Checking product" style={s.inline}><ActivityIndicator color={C.green} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>Checking product…</Text><Text style={s.bodySmall}>Looking up {barcode || 'barcode'} in USDA FoodData Central, then Open Food Facts, and matching against your profile.</Text></View></View><Skeleton width="60%" height={22} /><Skeleton height={64} /><Skeleton width="85%" /><Skeleton width="70%" /></Reveal>
              : product && assessment && result && <Reveal trigger={product} style={[s.card, s.resultCard]}><View testID="product-result" style={{ gap: 13 }}>
                <View style={s.between}><Text style={[s.sourceBadge, product.source === 'sample' ? { backgroundColor: C.amberSoft, color: C.amber } : { backgroundColor: C.blueSoft, color: C.blue }]}>{product.source === 'sample' ? 'FICTIONAL DEMO RESULT' : 'LIVE PRODUCT RESULT'}</Text><Tap accessibilityRole="button" accessibilityLabel="Close result" haptic="select" style={s.closeButton} pressedStyle={{ backgroundColor: C.border }} onPress={() => setProduct(null)}><X size={19} color={C.muted} /></Tap></View>
                <Text style={s.sectionTitle}>{product.name}</Text><Text style={s.bodySmall}>{product.brand} · {product.barcode}</Text>
                <View style={[s.resultBanner, { backgroundColor: tone[result.tone].bg, borderColor: tone[result.tone].fg }]}><View style={[s.resultIcon, { backgroundColor: tone[result.tone].fg }]}><result.Icon size={24} color="white" /></View><View style={{ flex: 1, gap: 4 }}><Text style={[s.resultTitle, { color: tone[result.tone].fg }]}>{assessment.title}</Text><Text style={[s.bodySmall, { color: C.ink }]}>{assessment.detail}</Text>{assessment.matches.length > 0 && <View style={s.chips}>{assessment.matches.map(m => <Text key={m} style={[s.matchChip, { color: tone[result.tone].fg, borderColor: tone[result.tone].fg }]}>{m}</Text>)}</View>}</View></View>
                <View style={s.detailBlock}><Text style={s.label}>Reported ingredients</Text><Text style={s.body}>{product.ingredients || 'Not provided by the source.'}</Text></View>
                {product.source === 'usda' ? <View style={s.detailBlock}><Text style={s.label}>Allergen check</Text><Text style={s.bodySmall}>USDA provides the manufacturer ingredient statement, not separate allergen or trace tags. Only the text above was checked; cross-contact remains unknown.</Text></View> : <>
                  <View style={s.detailBlock}><Text style={s.label}>Reported allergen tags</Text><Text style={s.body}>{reportedTags(product.allergens) || 'None listed — does not confirm absence.'}</Text></View>
                  <View style={s.detailBlock}><Text style={s.label}>Reported traces</Text><Text style={s.body}>{reportedTags(product.traces) || 'None listed — cross-contact remains unknown.'}</Text></View>
                </>}
                <View style={s.divider} /><Text style={s.footnote}>Checked against current saved profile: {allergies.map(allergyLabel).join(', ')}.</Text>
                <Text style={s.footnote}>{product.source === 'sample' ? 'Fictional sample. Not a real food assessment.' : product.source === 'usda' ? `USDA FoodData Central (manufacturer-submitted) · fetched ${new Date(product.fetchedAt).toLocaleString()} · record updated ${product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : 'unknown'}. Labels change; newer packages may differ.` : `Open Food Facts (community) · fetched ${new Date(product.fetchedAt).toLocaleString()} · source updated ${product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : 'unknown'}. Community data may be incomplete or outdated.`}</Text>
                {product.source === 'usda' && product.sourceId && <Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL(`https://fdc.nal.usda.gov/food-details/${product.sourceId}/nutrients`)}><Text style={s.link}>View source on USDA FoodData Central ↗</Text></Tap>}
                {product.source === 'openfoodfacts' && <Tap accessibilityRole="link" haptic="select" onPress={() => Linking.openURL(`https://world.openfoodfacts.org/product/${product.barcode}`)}><Text style={s.link}>View source on Open Food Facts ↗</Text></Tap>}
              </View></Reveal>}
          </View>}
        </>}
        {page === 'history' && <><Text style={s.eyebrow}>YOUR CURRENT SESSION</Text><View style={s.between}><Text accessibilityRole="header" style={s.pageTitle}>Recent scans</Text>{history.length > 0 && <Button secondary hapticKind="warning" icon={<RotateCcw accessible={false} size={17} color={C.ink} />} onPress={() => { setHistory([]); toast('Scan history cleared', 'info'); }}>Clear history</Button>}</View><Text style={s.body}>Up to 30 recent checks. Results recalculate against your current profile. History clears on sign out or reload.</Text>
          {history.length === 0 ? <Reveal style={[s.card, s.empty]}><View style={[s.iconTile, { alignSelf: 'center', padding: 16, borderRadius: 40 }]}><Clock3 size={34} color={C.green} /></View><Text style={s.cardTitle}>Your next scan starts here.</Text><Text style={[s.bodySmall, { textAlign: 'center' }]}>Checked products will appear in this session.</Text><Button onPress={() => navigate('scan')}>Check a product</Button></Reveal>
            : history.map((entry, index) => { const a = assess(entry.product, allergies); const r = RESULT[a.kind]; return <Tap accessibilityRole="button" key={`${entry.at}-${index}`} haptic="select" scaleTo={.98} onPress={() => { navigate('scan'); pendingScroll.current = true; setProduct(entry.product); }} style={[s.card, s.historyRow]} pressedStyle={{ borderColor: C.green }}>
              <View style={[s.resultIcon, { backgroundColor: tone[r.tone].bg }]}><r.Icon size={20} color={tone[r.tone].fg} /></View>
              <View style={{ flex: 1 }}><Text style={s.cardTitle}>{entry.product.name}</Text><Text style={[s.bodySmall, { color: tone[r.tone].fg, fontWeight: '600' }]}>{a.title}</Text><Text style={s.footnote}>{sourceName(entry.product)} · {new Date(entry.at).toLocaleTimeString()}</Text></View><ChevronRight size={22} color={C.green} />
            </Tap>; })}</>}
        {page === 'about' && <><Text style={s.eyebrow}>BUILT WITH CARE</Text><Text accessibilityRole="header" style={s.pageTitle}>A little more behind the check.</Text>
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
      {!wide && <View style={s.mobileNav}>{navItems.map(item => { const active = page === item.page; return <Tap key={item.page} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} haptic="select" scaleTo={.9} onPress={() => navigate(item.page)} style={s.mobileNavItem}>
        <View style={[s.mobileNavIcon, active && { backgroundColor: C.greenSoft }]}><Icon name={item.page} color={active ? C.green : C.muted} /></View><Text style={[s.mobileNavText, active && { color: C.green, fontWeight: '700' }]}>{item.short}</Text>
      </Tap>; })}</View>}
    </View>
  </View></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><ToastProvider><AppContent /></ToastProvider></SafeAreaProvider>; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: C.bg },
  appFrame: { flex: 1, flexDirection: 'row' }, main: { flex: 1, minWidth: 0, minHeight: 0 }, pageScroll: { flex: 1, minHeight: 0 },
  saveConfirmation: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.greenSoft },
  profileActions: { paddingHorizontal: 18, paddingVertical: 12, gap: 8, backgroundColor: C.paper, borderTopWidth: 1, borderColor: C.border, boxShadow: '0px -6px 18px rgba(23,51,43,0.06)' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  progressTrack: { height: 4, borderRadius: 4, backgroundColor: C.pale, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4, backgroundColor: C.green },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { padding: 8, borderRadius: 13, backgroundColor: C.green }, brandText: { color: C.ink, fontSize: 23, fontWeight: '800', letterSpacing: -1 },
  sidebar: { width: '20%', maxWidth: 290, minWidth: 238, backgroundColor: '#FBFCF8', borderRightWidth: 1, borderColor: C.border, padding: 24 },
  eyebrow: { color: C.muted, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', marginBottom: 8 },
  navItem: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 13, borderRadius: 12, marginBottom: 6 }, navActive: { backgroundColor: C.greenSoft }, navText: { color: C.ink, fontSize: 15, fontWeight: '500' }, navDot: { width: 7, height: 7, backgroundColor: C.green, borderRadius: 7, marginLeft: 'auto' },
  sidebarNote: { backgroundColor: C.pale, borderRadius: 16, padding: 18, gap: 10, marginTop: 30, marginBottom: 24 }, account: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, borderTopWidth: 1, borderColor: C.border }, avatar: { backgroundColor: C.greenSoft, padding: 9, borderRadius: 24 },
  topbar: { paddingVertical: 12, paddingHorizontal: 18, flexWrap: 'wrap', borderBottomWidth: 1, borderColor: C.border, backgroundColor: '#FBFCF8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  breadcrumb: { fontSize: 13, color: C.muted, flexShrink: 1 }, modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.greenSoft, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20 }, modeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: C.green },
  content: { padding: 36, gap: 24, width: '100%', maxWidth: 1320, alignSelf: 'center' },
  demoBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: C.amberSoft, borderRadius: 14, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 }, demoExit: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, pageTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -1, color: C.ink, marginBottom: 6, flexShrink: 1 },
  body: { fontSize: 15, color: C.muted, lineHeight: 23 }, bodySmall: { fontSize: 13, color: C.muted, lineHeight: 20 }, footnote: { fontSize: 12, color: C.muted, lineHeight: 18 }, roundLeaf: { padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 50, backgroundColor: C.paper },
  hero: { flexDirection: 'row', backgroundColor: '#214B3C', borderRadius: 24, overflow: 'hidden', boxShadow: '0px 16px 40px rgba(23,63,50,0.22)' }, heroCopy: { flex: 1.35, padding: 32, gap: 16 }, heroEyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '700', color: '#CBD9AE' }, heroTitle: { color: '#FAFCF4', fontSize: 36, fontWeight: '600', letterSpacing: -.8, lineHeight: 43 }, heroBody: { color: '#C7D4C7', fontSize: 15, lineHeight: 22, maxWidth: 360 }, heroCaption: { color: '#ADC2B0', fontSize: 11 },
  limeButton: { backgroundColor: C.lime, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14 }, limeButtonText: { color: C.ink, fontWeight: '800', fontSize: 15 },
  heroArt: { flex: .8, padding: 26, backgroundColor: '#2D5A48', alignItems: 'center', justifyContent: 'center' }, scanIllustration: { backgroundColor: '#FCFCF5', borderRadius: 20, padding: 17, width: '100%', maxWidth: 245, transform: [{ rotate: '5deg' }], gap: 12, boxShadow: '0px 14px 35px #183E3333' }, tinyLeaf: { padding: 5, backgroundColor: '#EDF2DD', borderRadius: 30 }, labelMini: { fontSize: 8, letterSpacing: 2, fontWeight: '700', color: C.green }, packageIllustration: { backgroundColor: '#E8EACD', padding: 14, alignItems: 'center', gap: 6, borderRadius: 10 }, packageBrand: { color: '#64754A', fontSize: 14, fontStyle: 'italic' }, packageName: { color: C.green, fontWeight: '800', fontSize: 25, textAlign: 'center', letterSpacing: 1 }, packageBottom: { fontSize: 7, letterSpacing: 1, color: C.muted }, illustrationBarcode: { alignItems: 'center' },
  columns: { flexDirection: 'row', gap: 20 }, card: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 22, gap: 13, boxShadow: shadow.card },
  cardTitle: { fontSize: 17, color: C.ink, fontWeight: '700', lineHeight: 23 }, sectionTitle: { fontSize: 24, fontWeight: '700', color: C.ink, letterSpacing: -.6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }, inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textLink: { color: C.green, fontSize: 13, fontWeight: '700' }, pillLink: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: C.pale },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 }, allergyChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: C.greenSoft, paddingVertical: 8, paddingHorizontal: 14 }, chipDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: C.green }, chipText: { fontSize: 13, color: C.green, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 3 }, iconTile: { alignSelf: 'flex-start', padding: 8, borderRadius: 11, backgroundColor: C.pale },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 }, stepNumber: { color: C.green, backgroundColor: C.greenSoft, fontSize: 12, fontWeight: '800', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20, overflow: 'hidden' }, sampleLabel: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.3 },
  sampleGrid: { flexDirection: 'row', gap: 16 }, sampleCard: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: 'hidden', backgroundColor: C.paper, boxShadow: shadow.card }, sampleArt: { padding: 15, minHeight: 128, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, sampleNumber: { fontSize: 10, fontWeight: '700', color: C.muted }, miniPack: { alignSelf: 'center', alignItems: 'center', gap: 12, paddingVertical: 20, paddingHorizontal: 14, borderRadius: 6, transform: [{ rotate: '-7deg' }], boxShadow: '0px 8px 14px rgba(0,0,0,0.12)' }, miniPackText: { color: '#FFFBEA', fontSize: 9, fontWeight: '800', letterSpacing: 1 }, sampleInfo: { padding: 14, gap: 8 }, sampleName: { fontSize: 14, fontWeight: '700', color: C.ink },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 15, borderTopWidth: 1, borderColor: C.border },
  welcome: { flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 44, padding: 24 }, welcomeBrand: { width: '100%', gap: 20, maxWidth: 590 }, welcomeTitle: { color: C.ink, fontWeight: '700', letterSpacing: -1.6 }, welcomeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  smallPill: { fontSize: 12, fontWeight: '600', color: C.green, backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 20, overflow: 'hidden' },
  welcomeGraphic: { flexDirection: 'row', gap: 18, padding: 18, backgroundColor: C.greenSoft, borderRadius: 20, alignItems: 'center' }, welcomeIcon: { padding: 12, borderRadius: 16, backgroundColor: C.paper },
  authCard: { width: '100%', maxWidth: 480, padding: 28, borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, gap: 16, boxShadow: shadow.card },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 4 }, input: { paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1.5, borderColor: C.borderStrong, borderRadius: 14, fontSize: 16, color: C.ink, backgroundColor: '#FBFCF8' }, inputFocused: { borderColor: C.green, backgroundColor: C.paper, boxShadow: '0px 0px 0px 4px rgba(31,90,69,0.12)' },
  link: { fontSize: 14, color: C.green, fontWeight: '700', paddingVertical: 9 }, consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  allergyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, allergyOption: { borderWidth: 1.5, borderColor: C.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14, gap: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: C.paper }, allergySelected: { borderColor: C.green, backgroundColor: C.greenSoft },
  allergenMark: { minWidth: 40, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, overflow: 'hidden', fontSize: 14, color: C.green, backgroundColor: C.pale, fontWeight: '800' },
  scannerPlaceholder: { alignItems: 'center', gap: 14, paddingVertical: 22, paddingHorizontal: 14, backgroundColor: '#F4F7EF', borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong },
  cameraFrame: { width: '100%', aspectRatio: 1, maxHeight: 420, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }, cameraGuide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 12 }, cameraTarget: { width: '76%', height: '34%', borderWidth: 3, borderColor: C.lime, borderRadius: 16 }, cameraGuideText: { color: 'white', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, overflow: 'hidden' },
  sampleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, borderBottomWidth: 1, borderColor: C.border }, sampleSwatch: { padding: 7, borderRadius: 9 },
  resultCard: { borderWidth: 1.5, boxShadow: '0px 14px 34px rgba(23,51,43,0.10)' }, sourceBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden' }, closeButton: { padding: 10, borderRadius: 20, backgroundColor: C.pale },
  resultBanner: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 16, borderLeftWidth: 5, marginVertical: 6 }, resultIcon: { alignSelf: 'flex-start', padding: 9, borderRadius: 14 }, resultTitle: { fontSize: 19, fontWeight: '800', lineHeight: 25 },
  matchChip: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden', backgroundColor: C.paper }, detailBlock: { gap: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }, empty: { alignItems: 'center', paddingVertical: 44 },
  mobileNav: { flexDirection: 'row', backgroundColor: '#FBFCF8', borderTopWidth: 1, borderColor: C.border, paddingVertical: 6 }, mobileNavItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 3 }, mobileNavIcon: { paddingVertical: 5, paddingHorizontal: 16, borderRadius: 20 }, mobileNavText: { textAlign: 'center', fontSize: 12, color: C.muted },
});
