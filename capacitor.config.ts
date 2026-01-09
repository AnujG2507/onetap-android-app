import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.onetap.shortcuts',
  appName: 'OneTap',
  webDir: 'dist',
  // For live reload during development, uncomment below:
  // server: {
  //   url: 'https://2fa7e10e-ca71-4319-a546-974fcb8a4a6b.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
  android: {
    minWebViewVersion: 89,
    backgroundColor: '#FFFFFF'
  }
};

export default config;
