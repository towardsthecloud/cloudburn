import type { GetLifecyclePolicyCommand } from '@aws-sdk/client-ecr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEcrClient } from '../../src/providers/aws/client.js';
import { hydrateAwsEcrRepositories } from '../../src/providers/aws/resources/ecr.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEcrClient: vi.fn(),
}));

const mockedCreateEcrClient = vi.mocked(createEcrClient);

describe('hydrateAwsEcrRepositories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates repositories and marks missing lifecycle policies as false', async () => {
    mockedCreateEcrClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: GetLifecyclePolicyCommand) => {
        const input = command.input as { repositoryName?: string };

        if (input.repositoryName === 'app') {
          return {
            lifecyclePolicyText: '{"rules":[]}',
          };
        }

        throw Object.assign(new Error('Lifecycle policy not found'), {
          name: 'LifecyclePolicyNotFoundException',
          $metadata: {
            requestId: `request-${region}`,
          },
        });
      });

      return { send } as never;
    });

    await expect(
      hydrateAwsEcrRepositories([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
          name: 'app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecr:repository',
          service: 'ecr',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecr:us-east-1:123456789012:repository/logs',
          name: 'logs',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecr:repository',
          service: 'ecr',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
        hasLifecyclePolicy: true,
        region: 'us-east-1',
        repositoryName: 'app',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ecr:us-east-1:123456789012:repository/logs',
        hasLifecyclePolicy: false,
        region: 'us-east-1',
        repositoryName: 'logs',
      },
    ]);
  });

  it('preserves ECR API context on access denied failures', async () => {
    mockedCreateEcrClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: ecr:GetLifecyclePolicy'), {
          code: 'AccessDeniedException',
          name: 'AccessDeniedException',
          $metadata: {
            requestId: 'request-123',
          },
        }),
      ),
    } as never);

    await expect(
      hydrateAwsEcrRepositories([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecr:eu-central-1:123456789012:repository/app',
          name: 'app',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'ecr:repository',
          service: 'ecr',
        },
      ]),
    ).rejects.toThrow(
      'Amazon ECR GetLifecyclePolicy failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: ecr:GetLifecyclePolicy Request ID: request-123.',
    );
  });

  it('skips stale repositories that no longer exist during hydration', async () => {
    mockedCreateEcrClient.mockImplementation(() => {
      const send = vi.fn(async (command: GetLifecyclePolicyCommand) => {
        const input = command.input as { repositoryName?: string };

        if (input.repositoryName === 'stale') {
          throw Object.assign(new Error('The repository does not exist'), {
            name: 'RepositoryNotFoundException',
            $metadata: {
              requestId: 'request-stale',
            },
          });
        }

        return {
          lifecyclePolicyText: '{"rules":[]}',
        };
      });

      return { send } as never;
    });

    await expect(
      hydrateAwsEcrRepositories([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
          name: 'app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecr:repository',
          service: 'ecr',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecr:us-east-1:123456789012:repository/stale',
          name: 'stale',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecr:repository',
          service: 'ecr',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
        hasLifecyclePolicy: true,
        region: 'us-east-1',
        repositoryName: 'app',
      },
    ]);
  });
});
