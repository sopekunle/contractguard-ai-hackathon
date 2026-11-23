import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { initializeAppCheck, type AppCheckProvider } from 'firebase/app-check';
import { build, createServer, type Plugin } from 'vite';
import { appCheckDebugStatus } from '../src/appCheckHosts.ts';

// These tests pin the ordering contract that the Cloud failure depended on. They do not
// call Gemini and do not use any project credentials.

describe('App Check / AI client ordering', () => {
  it('attaches App Check only when the AI instance is created after attestation', () => {
    const config = { apiKey: 'test-key', projectId: 'test-project', appId: 'test-app' };

    const earlyApp = initializeApp(config, 'early-ai');
    const earlyAI = getAI(earlyApp, { backend: new GoogleAIBackend() });
    assert.equal(
      Boolean((earlyAI as unknown as { appCheck?: unknown }).appCheck),
      false,
      'an AI instance created before App Check must not capture a provider'
    );

    const lateApp = initializeApp(config, 'late-ai');
    initializeAppCheck(lateApp, {
      provider: {
        getToken: async () => ({ token: 'test-token' }),
        initialize: async () => undefined,
      } as unknown as AppCheckProvider,
      isTokenAutoRefreshEnabled: false,
    });
    const lateAI = getAI(lateApp, { backend: new GoogleAIBackend() });
    assert.equal(
      Boolean((lateAI as unknown as { appCheck?: unknown }).appCheck),
      true,
      'an AI instance created after App Check must capture the provider'
    );
  });

  it('never creates the AI client during module evaluation', () => {
    const source = readFileSync(new URL('../src/firebase.ts', import.meta.url), 'utf8');
    // A module-level `const ai = getAI(...)` runs before asynchronous App Check setup and
    // silently produces an unattested client for the rest of the page session.
    const moduleLevelAssignment =
      /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::[^=\n]+)?=\s*[^;\n]*\bgetAI\s*\(/m;
    assert.equal(moduleLevelAssignment.test(source), false);
    assert.match(source, /export function getAIInstance/);
  });
});

describe('App Check development hosts', () => {
  it('keeps loopback opt-in compatible without a LAN allowlist', () => {
    for (const flag of ['true', '1', 'yes', 'on', ' TRUE ']) {
      for (const hostname of ['localhost', '127.0.0.1']) {
        assert.equal(appCheckDebugStatus(hostname, false, flag, undefined), 'enabled');
      }
    }
  });

  it('requires both opt-ins and trusted HTTPS for an exact private IPv4 address', () => {
    const lanHosts = '10.0.0.2, 172.31.4.8, 192.168.0.113';
    for (const hostname of lanHosts.split(', ')) {
      assert.equal(appCheckDebugStatus(hostname, true, 'true', lanHosts), 'enabled');
      assert.equal(appCheckDebugStatus(hostname, false, 'true', lanHosts), 'https-required');
      assert.equal(appCheckDebugStatus(hostname, true, undefined, lanHosts), 'disabled');
      assert.equal(appCheckDebugStatus(hostname, true, 'false', lanHosts), 'disabled');
      assert.equal(appCheckDebugStatus(hostname, true, 'true', undefined), 'host-not-allowed');
    }
    for (const entry of ['192.168.0.114', '192.168.0.*', '*', '192.168.0.0/24', '192.168.0.113:5173', 'https://192.168.0.113']) {
      assert.equal(appCheckDebugStatus('192.168.0.113', true, 'true', entry), 'host-not-allowed');
    }
  });

  it('rejects public, special-use, malformed, and DNS hostnames even when listed', () => {
    for (const hostname of [
      'localhost.example', '127.0.0.2', 'dev.local', '8.8.8.8', '100.64.0.1', '169.254.0.5',
      '172.15.0.1', '172.32.0.1', '192.169.0.1', '0.0.0.0', '192.168.0.256', '192.168.0.011', '[fc00::1]',
    ]) {
      assert.equal(appCheckDebugStatus(hostname, true, 'true', hostname), 'host-not-allowed');
    }
  });
});

const firebaseModule = fileURLToPath(new URL('../src/firebase.ts', import.meta.url));
const fixtureEnv = Object.fromEntries(Object.entries({
  VITE_FIREBASE_API_KEY: 'test-key',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_APP_ID: 'test-app',
  VITE_FIREBASE_APP_CHECK_SITE_KEY: 'test-enterprise-site-key',
  VITE_ENABLE_APP_CHECK_DEBUG: 'true',
  VITE_APP_CHECK_DEBUG_LAN_HOSTS: '192.168.0.113',
}).map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)]));

// Stub network-facing SDK calls while executing the app's real module through Vite.
const sdkModules = new Map([
  ['firebase/app', 'export const initializeApp = () => ({});'],
  ['firebase/ai', `
    export class GoogleAIBackend {}
    export function getAI() {
      self.events.push('ai');
      return {};
    }
  `],
  ['firebase/app-check', `
    export class ReCaptchaEnterpriseProvider { kind = 'enterprise'; }
    export class ReCaptchaV3Provider { kind = 'debug'; }
    export function initializeAppCheck(app, options) {
      self.events.push(options.provider.kind + ':' + (self.FIREBASE_APPCHECK_DEBUG_TOKEN === true));
    }
  `],
]);
const fixturePrefix = 'virtual:test-appcheck-sdk:';

function fakeFirebase(): Plugin {
  return {
    name: 'test-appcheck-sdk',
    enforce: 'pre',
    config() {
      return {
        resolve: { alias: [...sdkModules.keys()].map((id) => ({ find: id, replacement: fixturePrefix + id })) },
      };
    },
    resolveId(id) {
      if (id.startsWith(fixturePrefix)) return '\0' + id;
    },
    load(id) {
      if (id.startsWith('\0' + fixturePrefix)) return sdkModules.get(id.slice(fixturePrefix.length + 1));
    },
  };
}

function useLanBrowser(secure: boolean) {
  const origin = secure ? 'https://192.168.0.113:5173' : 'http://192.168.0.113:5173';
  const browser = { location: new URL(origin), isSecureContext: secure, events: [] as string[] };
  const previous = { window: globalThis.window, self: globalThis.self };
  Object.assign(globalThis, { window: browser, self: browser });
  return { browser, restore: () => Object.assign(globalThis, previous) };
}

describe('App Check environment integration', () => {
  it('initializes the LAN debug provider before creating the AI client on the Vite dev server', async () => {
    const { browser, restore } = useLanBrowser(true);
    const server = await createServer({
      envFile: false, logLevel: 'silent', define: fixtureEnv, plugins: [fakeFirebase()],
      server: { middlewareMode: true, ws: false, watch: null },
      ssr: { noExternal: true },
    });
    try {
      const module = await server.ssrLoadModule('/src/firebase.ts');
      if (module.getAppCheckState() === 'initializing') assert.equal(module.getAIInstance(), null);
      await module.whenAppCheckSettled();
      assert.equal(module.getAppCheckState(), 'ready');
      assert.deepEqual(browser.events, ['debug:true']);
      assert.ok(module.getAIInstance());
      assert.deepEqual(browser.events, ['debug:true', 'ai']);
    } finally {
      restore();
      await server.close();
    }
  });

  it('lets the on-device client initialize without App Check on an HTTP LAN origin', async () => {
    const { browser, restore } = useLanBrowser(false);
    const server = await createServer({
      envFile: false, logLevel: 'silent', define: fixtureEnv, plugins: [fakeFirebase()],
      server: { middlewareMode: true, ws: false, watch: null },
      ssr: { noExternal: true },
    });
    try {
      const module = await server.ssrLoadModule('/src/firebase.ts');
      await module.whenAppCheckSettled();
      assert.equal(module.getAppCheckState(), 'not-configured');
      assert.match(module.getAppCheckDetail(), /trusted HTTPS/);
      assert.deepEqual(browser.events, []);
      assert.ok(module.getAIInstance());
      assert.deepEqual(browser.events, ['ai']);
    } finally {
      restore();
      await server.close();
    }
  });

  it('uses Enterprise in a built bundle even with development mode and both debug settings', async () => {
    const { browser, restore } = useLanBrowser(true);
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const outputs = await build({
        mode: 'development', envFile: false, logLevel: 'silent', define: fixtureEnv,
        plugins: [fakeFirebase()],
        build: { write: false, minify: false, lib: { entry: firebaseModule, formats: ['es'], fileName: 'appcheck' } },
      });
      assert.ok(Array.isArray(outputs));
      const entry = outputs[0].output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
      assert.ok(entry && entry.type === 'chunk');
      const module = await import(`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`);
      await module.whenAppCheckSettled();
      assert.equal(module.isAppCheckDevServer, false);
      assert.equal(module.getAppCheckState(), 'ready');
      assert.deepEqual(browser.events, ['enterprise:false']);
      assert.equal(Object.hasOwn(browser, 'FIREBASE_APPCHECK_DEBUG_TOKEN'), false);
      assert.ok(module.getAIInstance());
      assert.deepEqual(browser.events, ['enterprise:false', 'ai']);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      restore();
    }
  });
});
