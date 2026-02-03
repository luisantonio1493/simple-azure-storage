import { webcrypto } from 'crypto';

// Azure SDK dependencies may call `crypto.randomUUID()` expecting Web Crypto
// on globalThis (not guaranteed in all Node 18 environments).
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}
