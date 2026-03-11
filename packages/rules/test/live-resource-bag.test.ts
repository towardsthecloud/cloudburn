import { describe, expect, it } from 'vitest';
import { LiveResourceBag } from '../src/index.js';

describe('LiveResourceBag', () => {
  it('returns stored datasets by key', () => {
    const bag = new LiveResourceBag({
      'aws-ebs-volumes': [{ accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp2' }],
    });

    expect(bag.get('aws-ebs-volumes')).toEqual([
      { accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp2' },
    ]);
  });

  it('returns an empty array for datasets that were not loaded', () => {
    const bag = new LiveResourceBag();

    expect(bag.get('aws-ec2-instances')).toEqual([]);
    expect(bag.get('aws-lambda-functions')).toEqual([]);
  });
});
