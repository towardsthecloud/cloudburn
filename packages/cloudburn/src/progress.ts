import type { AwsDiscoveryProgressEvent } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { isDebugEnabled } from './debug.js';

/**
 * Creates a stderr progress renderer for live discovery runs.
 *
 * Progress lines only render on interactive terminals so scripted and piped
 * invocations keep a quiet stderr, and debug mode keeps its more detailed
 * trace output instead of duplicating it with progress lines.
 *
 * @param command - Active Commander command.
 * @returns Progress callback, or `undefined` when progress output is off.
 */
export const resolveCliDiscoveryProgressLogger = (
  command: Command,
): ((event: AwsDiscoveryProgressEvent) => void) | undefined => {
  if (isDebugEnabled(command) || process.stderr.isTTY !== true) {
    return undefined;
  }

  return (event: AwsDiscoveryProgressEvent) => {
    process.stderr.write(
      event.kind === 'catalog'
        ? `discover: catalog ready with ${event.resourceCount} resources from ${event.searchRegion}\n`
        : `discover: datasets ${event.completedDatasets}/${event.totalDatasets} loaded (${event.datasetKey})\n`,
    );
  };
};
