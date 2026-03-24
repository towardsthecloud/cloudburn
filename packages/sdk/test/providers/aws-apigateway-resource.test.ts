import type { GetStageCommand } from '@aws-sdk/client-api-gateway';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiGatewayClient } from '../../src/providers/aws/client.js';
import { hydrateAwsApiGatewayStages } from '../../src/providers/aws/resources/apigateway.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createApiGatewayClient: vi.fn(),
}));

const mockedCreateApiGatewayClient = vi.mocked(createApiGatewayClient);

describe('hydrateAwsApiGatewayStages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered API Gateway stages with cache-cluster metadata', async () => {
    mockedCreateApiGatewayClient.mockReturnValue({
      send: vi.fn(async (command: GetStageCommand) => {
        expect(command.input).toEqual({
          restApiId: 'a1b2c3',
          stageName: 'prod',
        });

        return {
          cacheClusterEnabled: false,
          stageName: 'prod',
        };
      }),
    } as never);

    await expect(
      hydrateAwsApiGatewayStages([
        {
          accountId: '123456789012',
          arn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3/stages/prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'apigateway:restapis/stages',
          service: 'apigateway',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        cacheClusterEnabled: false,
        region: 'us-east-1',
        restApiId: 'a1b2c3',
        stageArn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3/stages/prod',
        stageName: 'prod',
      },
    ]);
  });
});
