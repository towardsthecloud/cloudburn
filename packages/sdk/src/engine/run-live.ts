import type { CloudBurnConfig, ScanResult } from '../types.js';

// Intent: orchestrate live AWS scans by discovery -> registry -> rule evaluation.
// TODO(cloudburn): discover resources through provider adapters and run live rules.
export const runLiveScan = async (_config: CloudBurnConfig): Promise<ScanResult> => ({
  mode: 'live',
  findings: [],
});
