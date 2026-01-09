import { registerPlugin } from '@capacitor/core';

export interface ShortcutPluginInterface {
  createPinnedShortcut(options: {
    id: string;
    label: string;
    iconUri?: string;
    iconEmoji?: string;
    iconText?: string;
    intentAction: string;
    intentData: string;
    intentType?: string;
  }): Promise<{ success: boolean }>;
  
  checkShortcutSupport(): Promise<{ supported: boolean; canPin: boolean }>;
  
  getSharedContent(): Promise<{ 
    action?: string;
    type?: string;
    data?: string;
    text?: string;
  } | null>;
}

// This plugin bridges to native Android code
// The actual implementation requires native Android/Kotlin code
const ShortcutPlugin = registerPlugin<ShortcutPluginInterface>('ShortcutPlugin', {
  web: () => import('./shortcutPluginWeb').then(m => new m.ShortcutPluginWeb()),
});

export default ShortcutPlugin;
