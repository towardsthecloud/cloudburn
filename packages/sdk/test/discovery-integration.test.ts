import { BudgetsClient } from '@aws-sdk/client-budgets';
import { STSClient } from '@aws-sdk/client-sts';
import { afterEach, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/scanner.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('evaluates account-scoped rules using the explicit target when no ambient region is configured', async () => {
  vi.stubEnv('CI', 'true');
  vi.stubEnv('AWS_REGION', undefined);
  vi.stubEnv('AWS_DEFAULT_REGION', undefined);
  vi.stubEnv('aws_region', undefined);
  vi.stubEnv('AWS_CONFIG_FILE', '/dev/null');
  vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/dev/null');
  vi.stubEnv('AWS_PROFILE', 'cloudburn-region-test');
  vi.spyOn(STSClient.prototype, 'send').mockImplementation(async function (this: STSClient) {
    expect(await this.config.region()).toBe('eu-west-1');
    return { Account: '123456789012' };
  });
  vi.spyOn(BudgetsClient.prototype, 'send').mockResolvedValue({ Budgets: [] });

  const result = await new CloudBurnClient().discover({
    target: { mode: 'region', region: 'eu-west-1' },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-COSTGUARDRAILS-1'] } },
  });

  expect(result.diagnostics).toBeUndefined();
  expect(result.providers).toMatchObject([
    { provider: 'aws', rules: [{ ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-1', findings: [{ accountId: '123456789012' }] }] },
  ]);
});
