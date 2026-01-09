import { useEffect } from 'react';
import { App } from '@capacitor/app';

interface UseBackButtonOptions {
  /** Callback when back button should exit the app */
  onExit?: () => void;
  /** Callback when back button should go back */
  onBack?: () => void;
  /** Whether we're on the home/root screen */
  isHomeScreen: boolean;
}

export function useBackButton({ onExit, onBack, isHomeScreen }: UseBackButtonOptions) {
  useEffect(() => {
    console.log('[useBackButton] Setting up back button handler, isHomeScreen:', isHomeScreen);
    
    const handler = App.addListener('backButton', ({ canGoBack }) => {
      console.log('[useBackButton] Back button pressed, canGoBack:', canGoBack, 'isHomeScreen:', isHomeScreen);
      
      if (isHomeScreen) {
        console.log('[useBackButton] On home screen, exiting app');
        if (onExit) {
          onExit();
        } else {
          App.exitApp();
        }
      } else if (onBack) {
        console.log('[useBackButton] Navigating back');
        onBack();
      } else if (canGoBack) {
        console.log('[useBackButton] Using browser history back');
        window.history.back();
      } else {
        console.log('[useBackButton] No back action available, exiting');
        App.exitApp();
      }
    });

    return () => {
      console.log('[useBackButton] Cleaning up back button handler');
      handler.then(h => h.remove());
    };
  }, [isHomeScreen, onExit, onBack]);
}
