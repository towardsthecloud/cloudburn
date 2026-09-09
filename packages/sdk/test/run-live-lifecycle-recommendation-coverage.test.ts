import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';
import { CloudBurnClient } from '../src/scanner.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));

const accountId = '123456789012';
const region = 'eu-west-1';
const catalog = { indexType: 'LOCAL' as const, resources: [], searchRegion: region };
const functionArn = (functionName: string) => `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;

const repository = (repositoryName: string, traits: { tagged: boolean | null; untagged: boolean | null }) => ({
  accountId,
  arn: `arn:aws:ecr:${region}:${accountId}:repository/${repositoryName}`,
  hasLifecyclePolicy: true,
  hasTaggedImageRetentionCap: traits.tagged,
  hasUntaggedImageExpiry: traits.untagged,
  region,
  repositoryName,
});

const lambdaFunction = (functionName: string) => ({
  accountId,
  architectures: ['x86_64'],
  functionArn: functionArn(functionName),
  functionName,
  memorySizeMb: 1024,
  region,
  timeoutSeconds: 30,
});

const discover = (enabledRules: string[]) =>
  new CloudBurnClient().discover({
    config: { discovery: { enabledRules }, iac: {} },
    includeEvaluationResources: true,
  });

const evaluationFor = (result: Awaited<ReturnType<typeof discover>>, ruleId: string) =>
  result.evaluations?.rules.find((rule) => rule.ruleId === ruleId);

describe('lifecycle and recommendation evaluation coverage', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    'CLDBRN-AWS-ECR-2',
    'CLDBRN-AWS-ECR-3',
  ])('%s reports unknown instead of passed when lifecycle traits are unavailable', async (ruleId) => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      diagnostics: [],
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [
          repository('unparsed', { tagged: null, untagged: null }),
          repository('compliant', { tagged: true, untagged: true }),
        ],
      }),
    });

    const result = await discover([ruleId]);

    expect(result.providers).toEqual([]);
    expect(evaluationFor(result, ruleId)).toMatchObject({
      status: 'unknown',
      findingCount: 0,
      reason: `Could not assess 1 resource(s) for rule ${ruleId} because required evidence was incomplete or unavailable.`,
      coverage: {
        assessed: [{ accountId, region, resourceId: 'compliant' }],
        unknown: [{ accountId, region, resourceId: 'unparsed' }],
      },
      resourceSetId: 'aws-ecr-repositories',
    });
    expect(result.diagnostics).toEqual([expect.objectContaining({ ruleId, status: 'skipped' })]);
    expect(result.evaluations?.resourceSets).toEqual([
      expect.objectContaining({
        id: 'aws-ecr-repositories',
        resources: expect.arrayContaining([expect.objectContaining({ resourceId: 'unparsed' })]),
      }),
    ]);
  });

  it('ECR lifecycle rules still pass when every repository has parsed traits or no policy', async () => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      diagnostics: [],
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [
          repository('compliant', { tagged: true, untagged: true }),
          { ...repository('no-policy', { tagged: null, untagged: null }), hasLifecyclePolicy: false },
        ],
      }),
    });

    const result = await discover(['CLDBRN-AWS-ECR-2', 'CLDBRN-AWS-ECR-3']);

    expect(result.evaluations?.rules.map((rule) => rule.status)).toEqual(['passed', 'passed']);
    expect(result.diagnostics).toBeUndefined();
  });

  it('CLDBRN-AWS-LAMBDA-4 reports unknown when Compute Optimizer returns an empty successful response', async () => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      diagnostics: [],
      resources: new LiveResourceBag({
        'aws-lambda-functions': [lambdaFunction('pending')],
        'aws-lambda-memory-recommendations': [],
      }),
    });

    const result = await discover(['CLDBRN-AWS-LAMBDA-4']);

    expect(result.providers).toEqual([]);
    expect(evaluationFor(result, 'CLDBRN-AWS-LAMBDA-4')).toMatchObject({
      status: 'unknown',
      findingCount: 0,
      coverage: {
        assessed: [],
        unknown: [{ accountId, region, resourceId: functionArn('pending'), resourceType: 'lambda:function' }],
      },
      resourceSetId: 'aws-lambda-functions',
    });
  });

  it('CLDBRN-AWS-LAMBDA-4 separates overprovisioned, analyzed, unavailable, and absent assessments', async () => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      diagnostics: [],
      resources: new LiveResourceBag({
        'aws-lambda-functions': ['overprovisioned', 'optimized', 'insufficient-data', 'pending'].map(lambdaFunction),
        'aws-lambda-memory-recommendations': [
          { accountId, assessment: 'memory_overprovisioned', functionArn: functionArn('overprovisioned'), region },
          { accountId, assessment: 'not_overprovisioned', functionArn: functionArn('optimized'), region },
          { accountId, assessment: 'unavailable', functionArn: functionArn('insufficient-data'), region },
        ],
      }),
    });

    const result = await discover(['CLDBRN-AWS-LAMBDA-4']);

    expect(result.providers[0]?.rules[0]?.findings).toEqual([
      {
        accountId,
        actionType: 'Rightsize',
        region,
        resourceId: functionArn('overprovisioned'),
        resourceType: 'lambda:function',
      },
    ]);
    expect(evaluationFor(result, 'CLDBRN-AWS-LAMBDA-4')).toMatchObject({
      status: 'triggered',
      findingCount: 1,
      coverage: {
        assessed: [
          expect.objectContaining({ resourceId: functionArn('overprovisioned') }),
          expect.objectContaining({ resourceId: functionArn('optimized') }),
        ],
        unknown: [
          expect.objectContaining({ resourceId: functionArn('insufficient-data') }),
          expect.objectContaining({ resourceId: functionArn('pending') }),
        ],
      },
    });
  });

  it('CLDBRN-AWS-LAMBDA-4 passes only when every function has an analyzed result', async () => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      diagnostics: [],
      resources: new LiveResourceBag({
        'aws-lambda-functions': [lambdaFunction('optimized')],
        'aws-lambda-memory-recommendations': [
          { accountId, assessment: 'not_overprovisioned', functionArn: functionArn('optimized'), region },
        ],
      }),
    });

    const result = await discover(['CLDBRN-AWS-LAMBDA-4']);

    expect(evaluationFor(result, 'CLDBRN-AWS-LAMBDA-4')).toMatchObject({ status: 'passed', findingCount: 0 });
    expect(result.diagnostics).toBeUndefined();
  });
});
