import { afterEach, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { CloudBurnClient } from '../src/scanner.js';

vi.mock('../src/engine/run-live.js', () => ({ runLiveScan: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
});

it('rejects a pre-cancelled discovery before starting provider work', async () => {
  const controller = new AbortController();
  controller.abort();
  vi.mocked(runLiveScan).mockResolvedValue({ providers: [] });
  await expect(new CloudBurnClient().discover({ signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(runLiveScan).not.toHaveBeenCalled();
});

it('rejects stalled discovery when its total deadline expires', async () => {
  vi.mocked(runLiveScan).mockImplementation(() => new Promise(() => undefined));
  await expect(new CloudBurnClient().discover({ timeoutMs: 20 })).rejects.toMatchObject({ name: 'TimeoutError' });
}, 1000);

it('cancels a running discovery with the caller’s reason', async () => {
  const controller = new AbortController();
  const reason = new Error('stop this scan');
  vi.mocked(runLiveScan).mockImplementation(() => new Promise(() => undefined));
  const run = new CloudBurnClient().discover({ signal: controller.signal });
  const assertion = expect(run).rejects.toBe(reason);
  await vi.waitFor(() => expect(runLiveScan).toHaveBeenCalledOnce());
  controller.abort(reason);
  await assertion;
}, 1000);
