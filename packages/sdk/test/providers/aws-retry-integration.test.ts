import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { afterEach, expect, it, vi } from 'vitest';
import { createEc2Client, withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { withAwsServiceErrorContext } from '../../src/providers/aws/resources/utils.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
}, 35_000);

it('spends one physical AWS request per service-wrapper attempt', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const client = await withAwsClientCredentials({ accessKeyId: 'test', secretAccessKey: 'test' }, async () =>
    createEc2Client({ region: 'us-east-1' }),
  );
  const handle = vi.spyOn(client.config.requestHandler, 'handle').mockResolvedValue({
    response: {
      statusCode: 400,
      headers: {},
      body: Buffer.from(
        '<Response><Errors><Error><Code>RequestLimitExceeded</Code><Message>Rate exceeded</Message></Error></Errors><RequestID>test</RequestID></Response>',
      ),
    },
  });
  try {
    const run = withAwsServiceErrorContext(
      'Amazon EC2',
      'DescribeInstances',
      'us-east-1',
      () => client.send(new DescribeInstancesCommand({})),
      { maxAttempts: 2, initialDelayMs: 0 },
    );
    const assertion = expect(run).rejects.toMatchObject({ name: 'RequestLimitExceeded' });
    let settled = false;
    void assertion.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 30_000, interval: 100 });
    await assertion;
    expect(handle).toHaveBeenCalledTimes(2);
  } finally {
    client.destroy();
  }
}, 35_000);
