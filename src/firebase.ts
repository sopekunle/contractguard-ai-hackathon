
import { initializeApp } from 'firebase/app';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from 'firebase/app-check';
import { appCheckDebugStatus } from './appCheckHosts';

declare const __CONTRACTGUARD_DEV_SERVER__: boolean;

export const isAppCheckDevServer = __CONTRACTGUARD_DEV_SERVER__ && import.meta.env.DEV;

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

export const isConfigured = Boolean(
  config.apiKey && config.projectId && config.appId
);

export const firebaseApp = isConfigured
  ? initializeApp(config)
  : null;

const productionAppCheckSiteKey = String(
  import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY ?? ''
).trim();

const hasValidProductionSiteKey = Boolean(
  productionAppCheckSiteKey &&
  productionAppCheckSiteKey !== 'none' &&
  !/^(your|replace|placeholder)/i.test(productionAppCheckSiteKey)
);

export type AppCheckState =
  | 'initializing'  // initialization is still running
  | 'ready'         // attestation is registered and can issue tokens
  | 'not-configured' // no usable attestation for this environment
  | 'failed'        // initialization threw
  | 'unavailable';  // Firebase itself is not configured

let appCheckState: AppCheckState = firebaseApp ? 'initializing' : 'unavailable';
let appCheckDetail = '';
let resolveAppCheck!: () => void;
const appCheckSettledPromise = new Promise<void>((resolve) => {
  resolveAppCheck = resolve;
});

export function getAppCheckState(): AppCheckState {
  return appCheckState;
}

export function getAppCheckDetail(): string {
  return appCheckDetail;
}

/** Resolves once App Check initialization has finished, successfully or not. Never rejects. */
export function whenAppCheckSettled(): Promise<void> {
  return appCheckSettledPromise;
}

/**
 * Cloud-capable requests are allowed only when attestation is actually registered.
 *
 * This used to return true for every development build, even when App Check had never been
 * initialized. That made the UI promise protection it did not have, and cloud requests then
 * failed at the first network call.
 */
export function isAppCheckReady(): boolean {
  return appCheckState === 'ready';
}

// App Check:
// - Debug mode is opt-in on the Vite dev server, on loopback or an allowlisted private IPv4
//   address served in a secure HTTPS context. The SDK generates and
//   prints a local debug token in DevTools when enabled; this app never reads, stores,
//   logs, or transmits that value itself.
// - Production uses reCAPTCHA Enterprise attestation with a site key supplied via env.
//   Leave the key empty until the real Hosting domain and site key are ready.
// Enforcement is controlled in the Firebase console and is NOT activated by this code.
async function initializeAppCheckForEnvironment(): Promise<void> {
  if (!firebaseApp) {
    appCheckState = 'unavailable';
    appCheckDetail = 'Firebase is not configured.';
    resolveAppCheck();
    return;
  }

  try {
    if (isAppCheckDevServer) {
      const debugStatus = appCheckDebugStatus(
        typeof window === 'undefined' ? '' : window.location.hostname,
        typeof window !== 'undefined' && window.isSecureContext && window.location.protocol === 'https:',
        import.meta.env.VITE_ENABLE_APP_CHECK_DEBUG,
        import.meta.env.VITE_APP_CHECK_DEBUG_LAN_HOSTS,
      );
      if (debugStatus !== 'enabled') {
        appCheckState = 'not-configured';
        appCheckDetail = {
          disabled: 'Set VITE_ENABLE_APP_CHECK_DEBUG=true in .env.local to enable local App Check debugging.',
          'host-not-allowed': 'Open localhost or 127.0.0.1, or add the exact private IPv4 address to VITE_APP_CHECK_DEBUG_LAN_HOSTS in .env.local.',
          'https-required': 'Open the allowlisted Wi-Fi address over trusted HTTPS. Firebase requires a secure connection to generate the Android Chrome debug token.',
        }[debugStatus];
        return;
      }

      const { ReCaptchaV3Provider } = await import('firebase/app-check');
      (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      initializeAppCheck(firebaseApp, {
        // The SDK performs its debug-token exchange in place of reCAPTCHA attestation.
        provider: new ReCaptchaV3Provider('none'),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckState = 'ready';
      return;
    }

    if (!hasValidProductionSiteKey) {
      appCheckState = 'not-configured';
      appCheckDetail = 'VITE_FIREBASE_APP_CHECK_SITE_KEY is missing.';
      console.warn(
        '[ContractGuard AI] Production App Check site key is not configured. ' +
        'Cloud-capable modes are disabled until VITE_FIREBASE_APP_CHECK_SITE_KEY is set.'
      );
      return;
    }

    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(productionAppCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckState = 'ready';
  } catch {
    appCheckState = 'failed';
    appCheckDetail = 'Check the Firebase App Check configuration and reload.';
    console.warn('[ContractGuard AI] App Check initialization failed; cloud-capable modes are disabled.');
  } finally {
    resolveAppCheck();
  }
}

void initializeAppCheckForEnvironment();

let aiInstance: AI | null = null;

/**
 * Returns the Firebase AI instance, creating it at most once.
 *
 * The AI SDK reads the App Check provider exactly once, in the AIService constructor
 * (`appCheckProvider.getImmediate({ optional: true })`). If getAI() runs before App Check is
 * registered, the instance keeps a null App Check reference for its whole lifetime and no
 * X-Firebase-AppCheck header is ever attached. Creating the instance only after App Check
 * has settled is what makes cloud inference actually attested.
 */
export function getAIInstance(): AI | null {
  if (!firebaseApp) return null;
  if (appCheckState === 'initializing') return null;
  if (!aiInstance) {
    aiInstance = getAI(firebaseApp, {
      backend: new GoogleAIBackend()
    });
    if (import.meta.env.DEV) {
      const attached = Boolean((aiInstance as unknown as { appCheck?: unknown }).appCheck);
      console.info(
        '[ContractGuard AI] App Check attached to the AI instance:',
        attached,
        '| state:',
        appCheckState
      );
    }
  }
  return aiInstance;
}
