import type { DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudTrailClient } from '../../src/providers/aws/client.js';
import { hydrateAwsCloudTrailTrails } from '../../src/providers/aws/resources/cloudtrail.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudTrailClient: vi.fn(),
}));

const mockedCreateCloudTrailClient = vi.mocked(createCloudTrailClient);

describe('hydrateAwsCloudTrailTrails', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered trails by batching trail arns per region', async () => {
    mockedCreateCloudTrailClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeTrailsCommand) => {
        const input = command.input as { trailNameList?: string[]; includeShadowTrails?: boolean };

        expect(input.includeShadowTrails).toBe(false);

        return {
          trailList: (input.trailNameList ?? []).map((trailArn) => ({
            HomeRegion: region,
            IsMultiRegionTrail: region === 'us-east-1',
            Name: trailArn.split('/').pop(),
            TrailARN: trailArn,
          })),
        };
      });

      return { send } as never;
    });

    const trails = await hydrateAwsCloudTrailTrails([
      {
        accountId: '123456789012',
        arn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail',
        properties: [],
        region: 'us-east-1',
        resourceType: 'cloudtrail:trail',
        service: 'cloudtrail',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:cloudtrail:us-west-2:123456789012:trail/regional-trail',
        properties: [],
        region: 'us-west-2',
        resourceType: 'cloudtrail:trail',
        service: 'cloudtrail',
      },
    ]);

    expect(mockedCreateCloudTrailClient).toHaveBeenCalledTimes(2);
    expect(trails).toEqual([
      {
        accountId: '123456789012',
        homeRegion: 'us-east-1',
        isMultiRegionTrail: true,
        isOrganizationTrail: false,
        region: 'us-east-1',
        trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail',
        trailName: 'org-trail',
      },
      {
        accountId: '123456789012',
        homeRegion: 'us-west-2',
        isMultiRegionTrail: false,
        isOrganizationTrail: false,
        region: 'us-west-2',
        trailArn: 'arn:aws:cloudtrail:us-west-2:123456789012:trail/regional-trail',
        trailName: 'regional-trail',
      },
    ]);
  });

  it('preserves CloudTrail error identity when trail hydration is access denied', async () => {
    mockedCreateCloudTrailClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: cloudtrail:DescribeTrails'), {
          name: 'AccessDeniedException',
          code: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
            requestId: 'request-789',
          },
        }),
      ),
    } as never);

    const error = await hydrateAwsCloudTrailTrails([
      {
        accountId: '123456789012',
        arn: 'arn:aws:cloudtrail:eu-central-1:123456789012:trail/org-trail',
        properties: [],
        region: 'eu-central-1',
        resourceType: 'cloudtrail:trail',
        service: 'cloudtrail',
      },
    ]).catch((err) => err);

    expect(error).toMatchObject({
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
    });
    expect((error as Error).message).toBe(
      'AWS CloudTrail DescribeTrails failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: cloudtrail:DescribeTrails Request ID: request-789.',
    );
  });
});
