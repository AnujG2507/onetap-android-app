import { useEffect, useRef } from 'react';
import { useSheetRegistry } from '@/contexts/SheetRegistryContext';

/**
 * Hook to register a sheet/dialog with the back button handler.
 * When the Android back button is pressed, registered sheets are closed
 * in reverse order of registration (most recent first).
 * 
 * @param sheetId - Unique identifier for this sheet
 * @param isOpen - Whether the sheet is currently open
 * @param onClose - Callback to close the sheet
 * @param priority - Optional priority (higher = closes first). Default is 0.
 *                   Use higher values for dialogs that should close before sheets.
 */
export function useSheetBackHandler(
  sheetId: string,
  isOpen: boolean,
  onClose: () => void,
  priority: number = 0
) {
  const { registerSheet, unregisterSheet } = useSheetRegistry();
  
  // Use ref to track the latest onClose without triggering re-registration
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      // Wrap the callback to always use the latest onClose
      const closeCallback = () => onCloseRef.current();
      registerSheet(sheetId, closeCallback, priority);
    } else {
      unregisterSheet(sheetId);
    }

    return () => {
      unregisterSheet(sheetId);
    };
  }, [isOpen, sheetId, priority, registerSheet, unregisterSheet]);
}
