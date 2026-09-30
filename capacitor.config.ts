import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inventorymovil.app',
  appName: 'La neverita',
  webDir: 'www',
  // El WebView sirve la app por https://localhost; sin esto bloquea las
  // peticiones al backend local (http://192.168.x.x:3000) por mixed content.
  android: { allowMixedContent: true }
};

export default config;
