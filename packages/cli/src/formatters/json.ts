import type { Finding } from '@cloudburn/sdk';

// Intent: produce machine-readable JSON for CI tooling and automation.
// TODO(cloudburn): align JSON envelope with final ScanResult contract.
export const formatJson = (findings: Finding[]): string => JSON.stringify({ findings }, null, 2);
