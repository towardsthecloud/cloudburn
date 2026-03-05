import type { CloudBurnConfig, ScanResult } from '../types.js';

// Intent: orchestrate static IaC scans by parser -> registry -> rule evaluation.
// TODO(cloudburn): evaluate static rule handlers and return real findings.
export const runStaticScan = async (_path: string, _config: CloudBurnConfig): Promise<ScanResult> => ({
  mode: 'static',
  findings: [],
});
