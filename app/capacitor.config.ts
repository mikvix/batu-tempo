import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.batutempo.app',
  appName: 'Batu Tempo',
  webDir: 'dist/batu-tempo/browser',
  backgroundColor: '#141216',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#141216',
      overlaysWebView: false,
    },
  },
};

export default config;
