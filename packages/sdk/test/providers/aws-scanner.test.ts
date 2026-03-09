import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAwsAccountId, resolveAwsRegions } from '../../src/providers/aws/client.js';
import { discoverAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';
import { discoverAwsLambdaFunctions } from '../../src/providers/aws/resources/lambda.js';
import { scanAwsResources } from '../../src/providers/aws/scanner.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  resolveAwsRegions: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ebs.js', () => ({
  discoverAwsEbsVolumes: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/lambda.js', () => ({
  discoverAwsLambdaFunctions: vi.fn(),
}));

const mockedResolveAwsRegions = vi.mocked(resolveAwsRegions);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);
const mockedDiscoverAwsEbsVolumes = vi.mocked(discoverAwsEbsVolumes);
const mockedDiscoverAwsLambdaFunctions = vi.mocked(discoverAwsLambdaFunctions);

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('scanAwsResources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves regions and account id once, then passes them to all discoverers', async () => {
    mockedResolveAwsRegions.mockResolvedValue(['us-east-1', 'us-west-2']);
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedDiscoverAwsEbsVolumes.mockResolvedValue([
      { volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1', accountId: '123456789012' },
    ]);
    mockedDiscoverAwsLambdaFunctions.mockResolvedValue([
      { functionName: 'my-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
    ]);

    const result = await scanAwsResources(['us-east-1']);

    expect(mockedResolveAwsRegions).toHaveBeenCalledWith(['us-east-1']);
    expect(mockedResolveAwsAccountId).toHaveBeenCalledOnce();
    expect(mockedDiscoverAwsEbsVolumes).toHaveBeenCalledWith(['us-east-1', 'us-west-2'], '123456789012');
    expect(mockedDiscoverAwsLambdaFunctions).toHaveBeenCalledWith(['us-east-1', 'us-west-2'], '123456789012');
    expect(result).toEqual({
      ebsVolumes: [{ volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1', accountId: '123456789012' }],
      lambdaFunctions: [
        { functionName: 'my-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
      ],
    });
  });

  it('starts all discoverers before awaiting their results', async () => {
    let resolveRegions: (value: string[]) => void;
    let resolveAccountId: (value: string) => void;
    let resolveEbs: (value: Awaited<ReturnType<typeof discoverAwsEbsVolumes>>) => void;
    let resolveLambda: (value: Awaited<ReturnType<typeof discoverAwsLambdaFunctions>>) => void;
    const regionsPromise = new Promise<string[]>((resolve) => {
      resolveRegions = resolve;
    });
    const accountIdPromise = new Promise<string>((resolve) => {
      resolveAccountId = resolve;
    });
    const ebsPromise = new Promise<Awaited<ReturnType<typeof discoverAwsEbsVolumes>>>((resolve) => {
      resolveEbs = resolve;
    });
    const lambdaPromise = new Promise<Awaited<ReturnType<typeof discoverAwsLambdaFunctions>>>((resolve) => {
      resolveLambda = resolve;
    });

    mockedResolveAwsRegions.mockReturnValue(regionsPromise);
    mockedResolveAwsAccountId.mockReturnValue(accountIdPromise);
    mockedDiscoverAwsEbsVolumes.mockReturnValue(ebsPromise);
    mockedDiscoverAwsLambdaFunctions.mockReturnValue(lambdaPromise);

    const scanPromise = scanAwsResources(['us-east-1']);

    expect(mockedDiscoverAwsEbsVolumes).not.toHaveBeenCalled();
    expect(mockedDiscoverAwsLambdaFunctions).not.toHaveBeenCalled();

    if (!resolveRegions || !resolveAccountId || !resolveEbs || !resolveLambda) {
      throw new Error('Expected deferred discoverer resolvers to be initialized');
    }

    resolveRegions(['us-east-1']);
    resolveAccountId('123456789012');
    await flushMicrotasks();

    expect(mockedDiscoverAwsEbsVolumes).toHaveBeenCalledWith(['us-east-1'], '123456789012');
    expect(mockedDiscoverAwsLambdaFunctions).toHaveBeenCalledWith(['us-east-1'], '123456789012');

    resolveEbs([]);
    resolveLambda([]);

    await expect(scanPromise).resolves.toEqual({
      ebsVolumes: [],
      lambdaFunctions: [],
    });
  });

  it('returns partial results when one discoverer fails', async () => {
    mockedResolveAwsRegions.mockResolvedValue(['us-east-1']);
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedDiscoverAwsEbsVolumes.mockRejectedValue(new Error('UnauthorizedOperation'));
    mockedDiscoverAwsLambdaFunctions.mockResolvedValue([
      { functionName: 'my-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
    ]);

    await expect(scanAwsResources(['us-east-1'])).resolves.toEqual({
      ebsVolumes: [],
      lambdaFunctions: [
        { functionName: 'my-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
      ],
    });
  });
});
