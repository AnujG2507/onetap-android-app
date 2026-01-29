import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { Clipboard } from '@capacitor/clipboard';
import i18n from '@/i18n';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ShortcutData } from '@/types/shortcut';

/**
 * WhatsApp Execution Helper
 * 
 * Philosophy:
 * - NEVER auto-send messages
 * - Messages are drafts that require user's final tap
 * - WhatsApp is a destination, not an automation target
 * - Graceful degradation if WhatsApp unavailable
 */

export interface WhatsAppExecutionOptions {
  phoneNumber: string;
  message?: string;
}

/**
 * Build a WhatsApp URL with optional message prefill
 * Uses the official wa.me universal link format
 */
export function buildWhatsAppUrl(options: WhatsAppExecutionOptions): string {
  const cleanNumber = options.phoneNumber.replace(/[^0-9]/g, '');
  let url = `https://wa.me/${cleanNumber}`;
  
  if (options.message && options.message.trim()) {
    try {
      url += `?text=${encodeURIComponent(options.message)}`;
    } catch (e) {
      console.warn('[WhatsApp] Failed to encode message, opening chat without prefill');
    }
  }
  
  return url;
}

/**
 * Open WhatsApp chat with optional message prefill
 * Returns true if successfully opened, false otherwise
 */
export async function openWhatsAppChat(options: WhatsAppExecutionOptions): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Use native plugin for more reliable handling
      const result = await ShortcutPlugin.openWhatsApp({
        phoneNumber: options.phoneNumber,
        message: options.message,
      });
      console.log('[WhatsApp] Opened via native plugin', options.message ? 'with message prefill' : 'only');
      return result.success;
    } else {
      // Web fallback - use window.open
      const url = buildWhatsAppUrl(options);
      window.open(url, '_blank');
      console.log('[WhatsApp] Opened via web', options.message ? 'with message prefill' : 'only');
      return true;
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to open:', error);
    return false;
  }
}

/**
 * Handle WhatsApp unavailable - show calm notification with copy option
 */
export async function handleWhatsAppUnavailable(message?: string): Promise<void> {
  const t = i18n.t.bind(i18n);
  
  if (message && message.trim()) {
    // Offer to copy the message
    toast(t('whatsapp.unavailable', 'WhatsApp is not available'), {
      action: {
        label: t('whatsapp.copyMessage', 'Copy message'),
        onClick: async () => {
          try {
            if (Capacitor.isNativePlatform()) {
              await Clipboard.write({ string: message });
            } else {
              await navigator.clipboard.writeText(message);
            }
            toast(t('whatsapp.messageCopied', 'Message copied to clipboard'));
          } catch (e) {
            console.error('[WhatsApp] Failed to copy message:', e);
          }
        },
      },
    });
  } else {
    toast(t('whatsapp.unavailable', 'WhatsApp is not available'));
  }
}

/**
 * Determine the action type for a WhatsApp shortcut based on message count
 */
export type WhatsAppActionType = 'open-chat' | 'prefill-message' | 'choose-message';

export function getWhatsAppActionType(shortcut: ShortcutData): WhatsAppActionType {
  const messages = shortcut.quickMessages || [];
  
  if (messages.length === 0) {
    return 'open-chat';
  } else if (messages.length === 1) {
    return 'prefill-message';
  } else {
    return 'choose-message';
  }
}

/**
 * Execute a WhatsApp shortcut with a specific message
 * This is called after message selection (if multiple messages)
 */
export async function executeWhatsAppShortcut(
  shortcut: ShortcutData,
  selectedMessage?: string
): Promise<boolean> {
  if (!shortcut.phoneNumber) {
    console.error('[WhatsApp] No phone number for shortcut');
    return false;
  }
  
  const success = await openWhatsAppChat({
    phoneNumber: shortcut.phoneNumber,
    message: selectedMessage,
  });
  
  if (!success) {
    await handleWhatsAppUnavailable(selectedMessage);
  }
  
  return success;
}
