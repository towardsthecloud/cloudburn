import { categorizeError } from '@cloudburn/sdk';

/**
 * Categorizes a runtime error and returns a structured JSON string, matching
 * the CLI's stderr error envelope.
 *
 * @param err - The thrown value; non-Error inputs map to a generic envelope.
 * @returns A pretty-printed `{"error": {...}}` JSON string for stderr.
 */
export const formatError = (err: unknown): string => JSON.stringify({ error: categorizeError(err) }, null, 2);
