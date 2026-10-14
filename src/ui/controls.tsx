import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Check, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react-native';
import { bothSchemes, nativeDriver, Palette, themes, Tone, type, useScheme } from './theme';
import { haptic, HapticKind } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const ToneIcon = ({ kind, size = 20 }: { kind: Tone; size?: number }) => {
  const { tone } = themes[useScheme()];
  const Component = { success: CircleCheck, info: Info, warning: TriangleAlert, danger: CircleAlert }[kind];
  return <Component accessible={false} size={size} color={tone[kind].fg} strokeWidth={2} />;
};

/** Pressable with a spring press-in scale, pressed tint and optional haptic on press. */
export function Tap({ style, pressedStyle, haptic: kind = 'tap', scaleTo = .97, onPress, onPressIn, onPressOut, disabled, children, ...rest }:
  Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle>; haptic?: HapticKind | null; scaleTo?: number; children?: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const spring = (toValue: number) => Animated.spring(scale, { toValue, useNativeDriver: nativeDriver, speed: 40, bounciness: toValue === 1 ? 8 : 0 }).start();
  return <AnimatedPressable {...rest} disabled={disabled}
    onPressIn={e => { setPressed(true); spring(scaleTo); onPressIn?.(e); }}
    onPressOut={e => { setPressed(false); spring(1); onPressOut?.(e); }}
    onPress={e => { if (kind) haptic[kind](); onPress?.(e); }}
    style={[style, pressed && pressedStyle, { transform: [{ scale }] }]}>{children}</AnimatedPressable>;
}

type Variant = 'primary' | 'secondary' | 'danger';
export function Button({ children, onPress, variant = 'primary', secondary = false, disabled = false, loading = false, icon, testID, hapticKind = 'tap' }:
  { children: string; onPress: () => void; variant?: Variant; secondary?: boolean; disabled?: boolean; loading?: boolean; icon?: React.ReactNode; testID?: string; hapticKind?: HapticKind }) {
  const scheme = useScheme(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  const v: Variant = secondary ? 'secondary' : variant;
  const fg = v === 'secondary' ? C.green : C.onAccent;
  const off = disabled || loading;
  return <Tap testID={testID} accessibilityRole="button" accessibilityState={{ disabled: off, busy: loading }} aria-busy={loading} onPress={onPress} disabled={off} haptic={hapticKind}
    style={[s.button, s[v], off && s.buttonOff]} pressedStyle={s[`${v}Pressed`]}>
    {loading ? <ActivityIndicator size="small" color={fg} /> : icon}
    <Text style={[s.buttonText, { color: fg }]}>{children}</Text>
  </Tap>;
}

export function Notice({ children, kind = 'warning' }: { children: React.ReactNode; kind?: Tone }) {
  const scheme = useScheme(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  return <View style={[s.notice, { backgroundColor: tone[kind].bg }]}><ToneIcon kind={kind} size={18} /><Text style={[s.noticeText, { color: tone[kind].fg }]}>{children}</Text></View>;
}

/** Fades and lifts children in when mounted, or whenever `trigger` changes. */
export function Reveal({ children, trigger, style, testID }: { children: React.ReactNode; trigger?: unknown; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
  }, [trigger]);
  return <Animated.View testID={testID} style={[style, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

/** Soft pulsing placeholder bar for loading states. */
export function Skeleton({ width = '100%', height = 14 }: { width?: `${number}%`; height?: number }) {
  const scheme = useScheme(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  const t = useRef(new Animated.Value(.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 650, useNativeDriver: nativeDriver }),
      Animated.timing(t, { toValue: .45, duration: 650, useNativeDriver: nativeDriver }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  return <Animated.View accessible={false} style={{ width, height, borderRadius: 7, backgroundColor: C.border, opacity: t }} />;
}

export function CheckMark({ checked, round = false }: { checked: boolean; round?: boolean }) {
  const scheme = useScheme(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  const t = useRef(new Animated.Value(checked ? 1 : 0)).current;
  useEffect(() => { Animated.spring(t, { toValue: checked ? 1 : 0, useNativeDriver: nativeDriver, speed: 28, bounciness: 12 }).start(); }, [checked]);
  return <View accessible={false} style={[s.checkbox, round && { borderRadius: 20 }, checked && s.checked]}>
    <Animated.View style={{ opacity: t, transform: [{ scale: t }] }}><Check size={15} color={C.onAccent} strokeWidth={3} /></Animated.View>
  </View>;
}

type Toast = { id: number; message: string; kind: Tone };
const ToastContext = createContext<(message: string, kind?: Tone) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);
/** Short transient confirmation. Never the only place important information appears. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const scheme = useScheme(); const { C, tone } = themes[scheme]; const s = STYLES[scheme];
  const [toast, setToast] = useState<Toast | null>(null);
  const t = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((message: string, kind: Tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, kind });
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
    t.setValue(0);
    Animated.spring(t, { toValue: 1, useNativeDriver: nativeDriver, speed: 18, bounciness: 7 }).start();
    timer.current = setTimeout(() => Animated.timing(t, { toValue: 0, duration: 220, useNativeDriver: nativeDriver }).start(({ finished }) => { if (finished) setToast(null); }), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={show}>
    <View style={{ flex: 1 }}>
      {children}
      {toast && <View pointerEvents="none" style={s.toastLayer}>
        <Animated.View testID="toast" key={toast.id} accessibilityLiveRegion="polite" style={[s.toast, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [.96, 1] }) }] }]}>
          <View style={[s.toastIcon, { backgroundColor: tone[toast.kind].bg }]}><ToneIcon kind={toast.kind} size={18} /></View>
          <Text style={s.toastText}>{toast.message}</Text>
        </Animated.View>
      </View>}
    </View>
  </ToastContext.Provider>;
}

const STYLES = bothSchemes((C: Palette, shadow) => StyleSheet.create({
  // Capsule buttons, filled for the primary action and tinted for the rest (buttons.md › Style: style, not size, marks the preferred choice).
  button: { minHeight: 50, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: { backgroundColor: C.green }, primaryPressed: { backgroundColor: C.greenDeep },
  secondary: { backgroundColor: C.greenSoft }, secondaryPressed: { backgroundColor: C.greenSoftPressed },
  danger: { backgroundColor: C.red }, dangerPressed: { backgroundColor: C.redPressed },
  buttonOff: { opacity: .5 }, buttonText: { flexShrink: 1, textAlign: 'center', ...type.headline },
  notice: { borderRadius: 16, padding: 14, gap: 10, flexDirection: 'row', alignItems: 'flex-start' }, noticeText: { flex: 1, ...type.subhead, fontWeight: '500' },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.paper, justifyContent: 'center', alignItems: 'center' }, checked: { backgroundColor: C.green, borderColor: C.green },
  toastLayer: { position: 'absolute', top: '2%', left: '4%', right: '4%', alignItems: 'center' },
  toast: { maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 18, borderRadius: 18, backgroundColor: C.toast, boxShadow: shadow.raised },
  toastIcon: { padding: 6, borderRadius: 20 }, toastText: { flexShrink: 1, color: C.toastText, ...type.subhead, fontWeight: '600' },
}));
