import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export async function triggerHapticFeedback(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    if (Capacitor.isNativePlatform()) {
      const impactStyle = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      }[style];
      
      await Haptics.impact({ style: impactStyle });
    } else if ('vibrate' in navigator) {
      const duration = { light: 10, medium: 20, heavy: 30 }[style];
      navigator.vibrate(duration);
    }
  } catch {
    // Silently fail if haptics not available
  }
}

export async function triggerSelectionFeedback() {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.selectionChanged();
    } else if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  } catch {
    // Silently fail
  }
}

// Alias for simpler API - maps to appropriate haptic styles
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light') {
  const styleMap: Record<string, 'light' | 'medium' | 'heavy'> = {
    light: 'light',
    medium: 'medium',
    heavy: 'heavy',
    success: 'light',
    warning: 'medium',
  };
  triggerHapticFeedback(styleMap[type] || 'light');
}
