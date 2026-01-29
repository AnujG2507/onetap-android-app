import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

export interface PendingWhatsAppAction {
  phoneNumber: string;
  messages: string[];
  contactName?: string;
}

/**
 * Hook to detect and handle pending WhatsApp actions from multi-message shortcuts.
 * 
 * When a WhatsApp shortcut with multiple messages is tapped:
 * 1. The WhatsAppProxyActivity stores the action data and opens the app
 * 2. This hook detects that pending action on startup
 * 3. The app shows the MessageChooserSheet
 * 4. After selection, we open WhatsApp with the chosen message
 */
export function usePendingWhatsAppAction() {
  const [pendingAction, setPendingAction] = useState<PendingWhatsAppAction | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Check for pending action on mount
  useEffect(() => {
    const checkPendingAction = async () => {
      if (!Capacitor.isNativePlatform()) {
        setIsChecking(false);
        return;
      }

      try {
        const result = await ShortcutPlugin.getPendingWhatsAppAction();
        
        if (result.success && result.hasPending && result.phoneNumber && result.messagesJson) {
          // Parse the messages
          const messages = JSON.parse(result.messagesJson) as string[];
          
          setPendingAction({
            phoneNumber: result.phoneNumber,
            messages,
            contactName: result.contactName,
          });
          
          console.log('[usePendingWhatsAppAction] Found pending action:', {
            phoneNumber: result.phoneNumber,
            messageCount: messages.length,
            contactName: result.contactName,
          });
        }
      } catch (error) {
        console.error('[usePendingWhatsAppAction] Error checking pending action:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkPendingAction();
  }, []);

  // Clear the pending action
  const clearPendingAction = useCallback(async () => {
    setPendingAction(null);
    
    if (Capacitor.isNativePlatform()) {
      try {
        await ShortcutPlugin.clearPendingWhatsAppAction();
      } catch (error) {
        console.error('[usePendingWhatsAppAction] Error clearing pending action:', error);
      }
    }
  }, []);

  // Handle message selection - open WhatsApp and clear the action
  const handleMessageSelected = useCallback(async (message: string) => {
    if (!pendingAction) return;

    try {
      await ShortcutPlugin.openWhatsApp({
        phoneNumber: pendingAction.phoneNumber,
        message,
      });
    } catch (error) {
      console.error('[usePendingWhatsAppAction] Error opening WhatsApp:', error);
    }

    await clearPendingAction();
  }, [pendingAction, clearPendingAction]);

  // Handle "open chat only" - open WhatsApp without message
  const handleOpenChatOnly = useCallback(async () => {
    if (!pendingAction) return;

    try {
      await ShortcutPlugin.openWhatsApp({
        phoneNumber: pendingAction.phoneNumber,
      });
    } catch (error) {
      console.error('[usePendingWhatsAppAction] Error opening WhatsApp:', error);
    }

    await clearPendingAction();
  }, [pendingAction, clearPendingAction]);

  return {
    pendingAction,
    isChecking,
    handleMessageSelected,
    handleOpenChatOnly,
    clearPendingAction,
  };
}
