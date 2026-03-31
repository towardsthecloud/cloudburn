import { describe, expect, it } from 'vitest';
import { sagemakerRunningNotebookInstanceRule } from '../src/aws/sagemaker/running-notebook-instance.js';
import type { AwsSageMakerNotebookInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createNotebookInstance = (
  overrides: Partial<AwsSageMakerNotebookInstance> = {},
): AwsSageMakerNotebookInstance => ({
  accountId: '123456789012',
  instanceType: 'ml.t3.medium',
  lastModifiedTime: '2026-03-01T00:00:00.000Z',
  notebookInstanceName: 'analytics-notebook',
  notebookInstanceStatus: 'InService',
  region: 'eu-west-1',
  ...overrides,
});

describe('sagemakerRunningNotebookInstanceRule', () => {
  it('flags notebook instances that are currently in service', () => {
    const finding = sagemakerRunningNotebookInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-notebook-instances': [createNotebookInstance()],
      }),
    });

    expect(finding).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'analytics-notebook',
        },
      ],
      message: 'SageMaker notebook instances should not remain running when they are no longer needed.',
      ruleId: 'CLDBRN-AWS-SAGEMAKER-1',
      service: 'sagemaker',
      source: 'discovery',
    });
  });

  it('skips notebook instances that are not in service', () => {
    const finding = sagemakerRunningNotebookInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-notebook-instances': [createNotebookInstance({ notebookInstanceStatus: 'Stopped' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
