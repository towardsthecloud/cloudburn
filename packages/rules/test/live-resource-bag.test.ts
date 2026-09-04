import { describe, expect, it } from 'vitest';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

describe('LiveResourceBag', () => {
  it('returns stored datasets by key', () => {
    const bag = new LiveResourceBag({
      'aws-s3-bucket-analyses': [
        {
          accountId: '123456789012',
          bucketName: 'logs-bucket',
          hasAbortIncompleteMultipartUploadAfter7Days: false,
          hasAlternativeStorageClassTransition: false,
          hasCostFocusedLifecycle: false,
          hasIntelligentTieringConfiguration: false,
          hasIntelligentTieringTransition: false,
          hasLifecycleSignal: false,
          hasUnclassifiedTransition: false,
          region: 'us-east-1',
        },
      ],
    });

    expect(bag.get('aws-s3-bucket-analyses')).toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: false,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('returns an empty array for datasets that were not loaded', () => {
    const bag = new LiveResourceBag();

    expect(bag.get('aws-ec2-instances')).toEqual([]);
    expect(bag.get('aws-ecr-repositories')).toEqual([]);
    expect(bag.get('aws-lambda-functions')).toEqual([]);
    expect(bag.get('aws-s3-bucket-analyses')).toEqual([]);
  });

  it('creates a derived bag without unavailable datasets', () => {
    const bag = new LiveResourceBag({
      'aws-cost-optimization-hub-savings-plans-recommendations': [
        {
          accountId: '123456789012',
          accountScope: 'LINKED',
          actionType: 'PurchaseSavingsPlans',
          currencyCode: 'USD',
          estimatedMonthlyCost: 200,
          estimatedMonthlySavings: 50,
          estimatedSavingsPercentage: 25,
          hourlyCommitment: 0.25,
          lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
          paymentOption: 'NoUpfront',
          recommendationId: 'recommendation-1',
          recommendationSource: 'CostExplorer',
          savingsPlansType: 'SageMakerSavingsPlans',
          term: 'OneYear',
        },
      ],
    });

    const derived = bag.without(['aws-cost-optimization-hub-savings-plans-recommendations']);

    expect(derived.get('aws-cost-optimization-hub-savings-plans-recommendations')).toEqual([]);
    expect(bag.get('aws-cost-optimization-hub-savings-plans-recommendations')).toHaveLength(1);
  });
});

describe('StaticResourceBag', () => {
  it('returns stored static datasets by key', () => {
    const bag = new StaticResourceBag({
      'aws-ec2-vpc-endpoints': [
        {
          location: {
            path: 'main.tf',
            column: 3,
            line: 4,
          },
          resourceId: 'aws_vpc_endpoint.s3',
          serviceName: 'com.amazonaws.us-east-1.s3',
          vpcEndpointType: 'interface',
        },
      ],
    });

    expect(bag.get('aws-ec2-vpc-endpoints')).toEqual([
      {
        location: {
          path: 'main.tf',
          column: 3,
          line: 4,
        },
        resourceId: 'aws_vpc_endpoint.s3',
        serviceName: 'com.amazonaws.us-east-1.s3',
        vpcEndpointType: 'interface',
      },
    ]);
  });

  it('returns an empty array for static datasets that were not loaded', () => {
    const bag = new StaticResourceBag();

    expect(bag.get('aws-ec2-instances')).toEqual([]);
    expect(bag.get('aws-ecr-repositories')).toEqual([]);
    expect(bag.get('aws-s3-bucket-analyses')).toEqual([]);
  });
});
