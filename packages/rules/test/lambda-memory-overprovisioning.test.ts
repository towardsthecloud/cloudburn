import { describe, expect, it } from 'vitest';
import { lambdaMemoryOverprovisioningRule } from '../src/aws/lambda/memory-overprovisioning.js';
import type { AwsLambdaMemoryRecommendation } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createRecommendation = (
  overrides: Partial<AwsLambdaMemoryRecommendation> = {},
): AwsLambdaMemoryRecommendation => ({
  accountId: '123456789012',
  currentMemorySizeMb: 512,
  estimatedMonthlySavingsUsd: 4.25,
  functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:my-function',
  lastRefreshTime: '2026-03-23T00:00:00.000Z',
  recommendedMemorySizeMb: 256,
  region: 'us-east-1',
  savingsOpportunityPercentage: 32,
  ...overrides,
});

describe('lambdaMemoryOverprovisioningRule', () => {
  it('flags functions that Compute Optimizer identifies as memory-overprovisioned', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-memory-recommendations': [createRecommendation()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-4',
      service: 'lambda',
      severity: 'medium',
      source: 'discovery',
      message: 'Lambda functions should not keep memory far above their observed execution needs.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'arn:aws:lambda:us-east-1:123456789012:function:my-function',
          resourceType: 'lambda:function',
        },
      ],
    });
  });

  it('returns no finding when Compute Optimizer has no memory recommendation', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({ 'aws-lambda-memory-recommendations': [] }),
    });

    expect(finding).toBeNull();
  });
});
