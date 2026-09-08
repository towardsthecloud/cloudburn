const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const main = async () => {
  const sdk = process.argv[2] === 'module' ? await import('@cloudburn/sdk') : require('@cloudburn/sdk');
  const dependency = createRequire(require.resolve('@cloudburn/sdk'));
  const { EC2Client } = dependency('@aws-sdk/client-ec2');
  const { STSClient } = dependency('@aws-sdk/client-sts');
  const { CostExplorerClient } = dependency('@aws-sdk/client-cost-explorer');
  const probe = new EC2Client({ region: 'eu-west-1' });
  const transport = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  const originalHandle = transport.handle;
  const originals = [STSClient, CostExplorerClient].map((Client) => [Client, Client.prototype.destroy]);
  const destroyed = [];
  const requests = [];
  const signals = [];
  const admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-consumer-discovery-'));
  process.env.CLOUDBURN_AWS_ADMISSION_DIR = admissionDirectory;
  process.env.AWS_REGION = 'eu-west-1';
  process.env.AWS_EC2_METADATA_DISABLED = 'true';
  let holdRequest = false;
  const started = Promise.withResolvers();

  for (const [Client, destroy] of originals) {
    Client.prototype.destroy = function () {
      destroyed.push(Client.name);
      return destroy.call(this);
    };
  }
  transport.handle = async (request, options) => {
    const operation =
      request.headers['x-amz-target']?.split('.').at(-1) ?? new URLSearchParams(String(request.body)).get('Action');
    requests.push(operation);
    assert.match(request.headers.authorization, /Credential=SCOPED\//);
    assert.ok(options?.abortSignal, 'The emitted live chunks share the managed execution signal.');
    signals.push(options.abortSignal);
    if (holdRequest && operation === 'GetAnomalyMonitors') {
      return new Promise((_resolve, reject) => {
        options.abortSignal.addEventListener('abort', () => reject(options.abortSignal.reason), { once: true });
        started.resolve();
      });
    }
    if (operation === 'GetCallerIdentity') {
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            '<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>arn:aws:iam::111111111111:user/synthetic</Arn><UserId>SYNTHETIC</UserId><Account>111111111111</Account></GetCallerIdentityResult></GetCallerIdentityResponse>',
          ),
        },
      };
    }
    assert.equal(operation, 'GetAnomalyMonitors', `Unexpected offline AWS request: ${operation}`);
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"AnomalyMonitors":[]}'),
      },
    };
  };

  const discover = (signal) =>
    sdk.withAwsClientCredentials({ accessKeyId: 'SCOPED', secretAccessKey: 'synthetic-key' }, () =>
      new sdk.CloudBurnClient().discover({
        signal,
        timeoutMs: 10_000,
        target: { mode: 'region', region: 'eu-west-1' },
        config: { discovery: { enabledRules: ['CLDBRN-AWS-COSTGUARDRAILS-2'] } },
      }),
    );

  try {
    const result = await discover();
    assert.deepEqual(
      result.providers.flatMap((provider) => provider.rules.flatMap((rule) => rule.findings)),
      [{ resourceId: '111111111111', accountId: '111111111111' }],
    );
    assert.deepEqual(requests, ['GetCallerIdentity', 'GetAnomalyMonitors']);
    assert.deepEqual(destroyed.sort(), ['CostExplorerClient', 'STSClient']);
    assert.ok(
      signals.every((signal) => signal.aborted),
      'Completed discovery disposes its execution.',
    );

    holdRequest = true;
    const controller = new AbortController();
    const reason = new Error('Installed consumer cancelled discovery');
    const run = discover(controller.signal);
    const rejected = assert.rejects(run, (error) => error === reason);
    await Promise.race([started.promise, run]);
    const requestCount = requests.length;
    controller.abort(reason);
    await rejected;
    assert.ok(signals.every((signal) => signal.aborted));
    assert.equal(destroyed.length, 4);
    await delay(50);
    assert.equal(requests.length, requestCount, 'Cancelled discovery must not dispatch later requests.');
    process.stdout.write('ok\n');
  } finally {
    transport.handle = originalHandle;
    for (const [Client, destroy] of originals) Client.prototype.destroy = destroy;
    rmSync(admissionDirectory, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
