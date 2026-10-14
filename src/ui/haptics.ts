import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptics are a supplement to visible feedback, never the only signal. Web is a no-op.
const run = (fn: () => Promise<void>) => { if (Platform.OS !== 'web') fn().catch(() => undefined); };
export const haptic = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  firm: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
export type HapticKind = keyof typeof haptic;
