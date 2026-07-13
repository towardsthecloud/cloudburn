import type { IaCResource } from '@cloudburn/rules';
import type { ScanDiagnostic } from '../types.js';

/** Resources and non-fatal diagnostics produced by a static IaC parser. */
export type IaCParseResult = {
  diagnostics: ScanDiagnostic[];
  resources: IaCResource[];
};

// Intent: re-export parser resource contracts from rules for a stable SDK surface.
export type { IaCResource };
