import { createLocalAwsRequestStore } from '../../../src/providers/aws/request-store.ts';

const [directory, key, mode, count] = process.argv.slice(2);
const store = createLocalAwsRequestStore(directory);

if (mode === 'hold') {
  await store.update(key, (current) => {
    process.send?.('locked');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
    return { state: String(Number(current ?? 0) + 1), value: undefined };
  });
} else {
  for (let index = 0; index < Number(count); index += 1) {
    await store.update(key, (current) => {
      const next = Number(current ?? 0) + 1;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
      return { state: String(next), value: undefined };
    });
  }
}

process.disconnect?.();
