import { describe, expect, it } from 'vitest';
import { groupFindingsByProvider } from '../src/engine/group-findings.js';

describe('groupFindingsByProvider', () => {
  it('drops null and empty rule groups while preserving non-empty provider groups', () => {
    expect(
      groupFindingsByProvider([
        {
          provider: 'aws',
          finding: null,
        },
        {
          provider: 'aws',
          finding: {
            ruleId: 'CLDBRN-AWS-EBS-1',
            service: 'ebs',
            source: 'discovery',
            message: 'EBS volumes should use current-generation storage.',
            findings: [],
          },
        },
        {
          provider: 'aws',
          finding: {
            ruleId: 'CLDBRN-AWS-EBS-1',
            service: 'ebs',
            source: 'discovery',
            message: 'EBS volumes should use current-generation storage.',
            findings: [
              {
                resourceId: 'vol-123',
                region: 'us-east-1',
              },
            ],
          },
        },
      ]),
    ).toEqual([
      {
        provider: 'aws',
        rules: [
          {
            ruleId: 'CLDBRN-AWS-EBS-1',
            service: 'ebs',
            source: 'discovery',
            message: 'EBS volumes should use current-generation storage.',
            findings: [
              {
                resourceId: 'vol-123',
                region: 'us-east-1',
              },
            ],
          },
        ],
      },
    ]);
  });
});
