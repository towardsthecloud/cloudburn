import type { AwsEbsSnapshot } from './index.js';

type AssertExported<_T extends U, U> = true;

// Keep this in src so tsc validates that public barrel type exports resolve for consumers.
const awsEbsSnapshotBarrelTypeCheck: AssertExported<
  AwsEbsSnapshot,
  {
    accountId: string;
    region: string;
    snapshotId: string;
    startTime?: string;
    state?: string;
    volumeId?: string;
    volumeSizeGiB?: number;
  }
> = true;

void awsEbsSnapshotBarrelTypeCheck;
