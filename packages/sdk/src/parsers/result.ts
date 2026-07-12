import type { ScanDiagnostic } from '../types.js';
import type { IaCParseResult } from './types.js';

/** Returns an IaC parser result with no resources or diagnostics. */
export const createEmptyIaCParseResult = (): IaCParseResult => ({ diagnostics: [], resources: [] });

/**
 * Returns an IaC parser result containing one non-fatal skipped-file diagnostic.
 *
 * @param diagnostic - Parser-specific diagnostic fields.
 * @returns An empty resource collection with the normalized diagnostic.
 */
export const createSkippedIaCParseResult = (
  diagnostic: Pick<ScanDiagnostic, 'code' | 'details' | 'message' | 'service'>,
): IaCParseResult => ({
  diagnostics: [
    {
      ...diagnostic,
      provider: 'aws',
      source: 'iac',
      status: 'skipped',
    },
  ],
  resources: [],
});
