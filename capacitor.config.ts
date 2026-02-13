import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.onetap.access',
  appName: 'OneTap',
  webDir: 'dist',
  // For live reload during development, uncomment and set your local IP:
  // server: {
  //   url: 'http://YOUR_LOCAL_IP:8080',
  //   cleartext: true
  // },
  android: {
    minWebViewVersion: 89,
    backgroundColor: '#FFFFFF'
  }
};

export default config;
