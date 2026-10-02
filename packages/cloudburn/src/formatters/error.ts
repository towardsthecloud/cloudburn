import { categorizeError } from '@cloudburn/sdk';

/**
 * Categorizes a runtime error and returns a structured JSON string
 * suitable for writing to stderr.
 *
 * @param err - The thrown value; non-Error inputs map to a generic runtime error.
 * @returns A pretty-printed `{"error": {"code", "message"}}` JSON string with a redacted message.
 */
export const formatError = (err: unknown): string => JSON.stringify({ error: categorizeError(err) }, null, 2);
