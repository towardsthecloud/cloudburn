import { GetStageCommand } from '@aws-sdk/client-api-gateway';
import type { AwsApiGatewayStage, AwsDiscoveredResource } from '@cloudburn/rules';
import { createApiGatewayClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const API_GATEWAY_STAGE_CONCURRENCY = 10;

type ParsedApiGatewayStage = {
  restApiId: string;
  stageArn: string;
  stageName: string;
};

const parseApiGatewayStageArn = (arn: string): ParsedApiGatewayStage | null => {
  const match = /^arn:[^:]+:apigateway:([^:]+)::\/restapis\/([^/]+)\/stages\/([^/]+)$/u.exec(arn);

  if (!match) {
    return null;
  }

  const region = match[1];
  const restApiId = match[2];
  const stageName = match[3];

  if (!region || !restApiId || !stageName) {
    return null;
  }

  return {
    restApiId,
    stageArn: arn,
    stageName,
  };
};

/**
 * Hydrates discovered API Gateway REST API stages with stage-cache metadata.
 *
 * @param resources - Catalog resources filtered to API Gateway REST API stages.
 * @returns Hydrated API Gateway stages for rule evaluation.
 */
export const hydrateAwsApiGatewayStages = async (resources: AwsDiscoveredResource[]): Promise<AwsApiGatewayStage[]> => {
  const stagesByRegion = new Map<string, Array<{ accountId: string } & ParsedApiGatewayStage>>();

  for (const resource of resources) {
    const parsed = parseApiGatewayStageArn(resource.arn);

    if (!parsed) {
      continue;
    }

    const regionStages = stagesByRegion.get(resource.region) ?? [];
    regionStages.push({
      accountId: resource.accountId,
      ...parsed,
    });
    stagesByRegion.set(resource.region, regionStages);
  }

  const hydratedPages = await Promise.all(
    [...stagesByRegion.entries()].map(async ([region, regionStages]) => {
      const client = createApiGatewayClient({ region });
      const stages: AwsApiGatewayStage[] = [];

      for (const batch of chunkItems(regionStages, API_GATEWAY_STAGE_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (stage) => {
            const response = await withAwsServiceErrorContext('Amazon API Gateway', 'GetStage', region, () =>
              client.send(
                new GetStageCommand({
                  restApiId: stage.restApiId,
                  stageName: stage.stageName,
                }),
              ),
            );

            return {
              accountId: stage.accountId,
              cacheClusterEnabled: response.cacheClusterEnabled,
              region,
              restApiId: stage.restApiId,
              stageArn: stage.stageArn,
              stageName: response.stageName ?? stage.stageName,
            } satisfies AwsApiGatewayStage;
          }),
        );

        stages.push(...hydratedBatch);
      }

      return stages;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.stageArn.localeCompare(right.stageArn));
};
