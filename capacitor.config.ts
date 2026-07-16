import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'uz.uytamir.app',
  appName: "UyTa'mir",
  // Vite builds into frontend/dist; run `npm run build` inside frontend/ first.
  webDir: 'frontend/dist',
  ios: {
    contentInset: 'automatic',
    // Prevents navigation to external URLs inside the WKWebView.
    limitsNavigationsToAppBoundDomains: true,
    // Needed so WKWebView can reach the FastAPI backend during dev.
    // In production, the app talks to the hosted API; remove allowsLinkPreview.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
}

export default config
