const assert = require('node:assert/strict');
const { registerHooks } = require('node:module');

const main = async () => {
  const sdk = process.argv[2] === 'module' ? await import('@cloudburn/sdk') : require('@cloudburn/sdk');
  const controller = new AbortController();
  const reason = new Error('Cancel while the first AWS module loads');
  let intercepted = false;
  let credentialCalls = 0;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!intercepted && specifier.startsWith('@aws-sdk/client-')) {
        intercepted = true;
        // Abort at a real module-loading boundary before the live continuation can run.
        controller.abort(reason);
      }
      return nextResolve(specifier, context);
    },
  });
  const credentials = () => {
    credentialCalls++;
    throw new Error('Cancelled lazy loading must not resolve credentials');
  };
  await assert.rejects(
    new sdk.CloudBurnClient().discover({
      signal: controller.signal,
      aws: { credentials },
      cache: { mode: 'normal' },
      target: { mode: 'region', region: 'eu-west-1' },
      config: { discovery: { enabledRules: ['CLDBRN-AWS-COSTGUARDRAILS-2'] } },
    }),
    (error) => error === reason,
  );
  assert.equal(intercepted, true, 'Cancel during the first live import, before any credentials resolve.');
  // Imports can finish after the facade rejects. Check again when pending module work has drained.
  process.once('beforeExit', () => {
    hook.deregister();
    assert.equal(credentialCalls, 0);
    process.stdout.write('ok\n');
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
