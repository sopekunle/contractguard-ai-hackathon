import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, isPreview, mode }) => {
  // NODE_ENV and --mode do not decide whether a built bundle may use App Check debugging.
  const devServer = command === 'serve' && !isPreview;
  const define = { __CONTRACTGUARD_DEV_SERVER__: JSON.stringify(devServer) };
  if (!devServer) return { define };

  const env = loadEnv(mode, process.cwd(), 'CONTRACTGUARD_DEV_TLS_');
  const certPath = env.CONTRACTGUARD_DEV_TLS_CERT;
  const keyPath = env.CONTRACTGUARD_DEV_TLS_KEY;
  if (!certPath && !keyPath) return { define };
  if (!certPath || !keyPath) {
    throw new Error('Set both CONTRACTGUARD_DEV_TLS_CERT and CONTRACTGUARD_DEV_TLS_KEY to enable local HTTPS.');
  }

  return {
    define,
    server: { https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } },
  };
});
