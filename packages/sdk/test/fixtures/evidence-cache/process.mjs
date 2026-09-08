import { createEvidenceCache } from '../../../src/evidence-cache.ts';

const [directory, value, mode = 'normal', lease = '300'] = process.argv.slice(2);
const cache = createEvidenceCache({ directory, leaseMs: Number(lease), pollMs: 10 });
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
const controller = new AbortController();
process.on('message', (message) => {
  if (message === 'release') release();
  if (message === 'cancel') controller.abort(new Error('child cancelled'));
});
process.send?.({ kind: 'ready' });
try {
  const result = await cache.load({
    key: 'shared-process-key',
    ttlMs: 60_000,
    mode,
    signal: controller.signal,
    load: async () => {
      process.send?.({ kind: 'loading' });
      await gate;
      return { value, complete: true };
    },
  });
  process.send?.({ kind: 'result', result });
} catch (error) {
  process.send?.({ kind: 'error', message: error.message });
}
process.disconnect?.();
