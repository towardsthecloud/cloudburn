import type { ScanResult } from '@cloudburn/sdk';

// Intent: produce machine-readable JSON for CI tooling and automation.
// TODO(cloudburn): align JSON envelope with final ScanResult contract.
export const formatJson = (result: ScanResult): string => JSON.stringify(result, null, 2);
