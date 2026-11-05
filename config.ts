/**
 * Secure configuration (Secure Engine). Only public client identifiers live here.
 * Service-account keys, admin credentials and provider secrets must never be bundled.
 */
import {Platform} from 'react-native';
import firebaseConfig from '../auth/firebaseConfig.json';
import appConfig from '../../app.json';

declare const __DEV__: boolean | undefined;
export const IS_DEV = typeof __DEV__ !== 'undefined' ? !!__DEV__ : false;
export const APP_VERSION: string = appConfig.expo.version;
export const LAST_SECURITY_REVIEW = '2026-11-05';
export const PRIVACY_POLICY_URL = 'https://gen-z-code-55caf.web.app/privacy.html';
export const ACCOUNT_DELETION_URL = 'https://gen-z-code-55caf.web.app/delete-account.html';

/** Public Firebase client configuration (identifies the project; not an access credential). */
export const FIREBASE_CONFIG = {apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId};

/**
 * Local emulator support for testing only. EXPO_PUBLIC_* values are inlined at build time;
 * `npm run release:check` and the security scan fail if this is enabled for a release.
 */
export const EMULATOR_HOST: string | null = (() => {
  // Direct member access is required for Expo's build-time inlining of EXPO_PUBLIC_* values.
  const flag = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  // Never honoured by native release builds, even if a stale Metro cache carried the value in.
  if (!IS_DEV && Platform.OS !== 'web') return null;
  return typeof flag === 'string' && /^(?:localhost|127\.0\.0\.1|10\.0\.2\.2)$/.test(flag) ? flag : null;
})();
