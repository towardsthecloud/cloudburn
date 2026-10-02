import { type CategorizedError, categorizeError } from '@cloudburn/sdk';
import type { CallToolResult } from '@modelcontextprotocol/server';

/** Tool argument error raised before any scan starts. */
export class InvalidArgumentError extends Error {
  public readonly code = 'INVALID_ARGUMENT';
}

const CREDENTIALS_MESSAGE =
  "AWS credentials not found or expired. Refresh the session (for example 'aws sts get-caller-identity') and set AWS_PROFILE or AWS_REGION in the environment that starts the MCP server.";

const categorize = (err: unknown): CategorizedError => {
  if (err instanceof InvalidArgumentError) {
    return { code: err.code, message: err.message };
  }

  const categorized = categorizeError(err);
  return categorized.code === 'CREDENTIALS_ERROR' ? { ...categorized, message: CREDENTIALS_MESSAGE } : categorized;
};

/**
 * Converts a thrown value into an MCP tool error result with the CLI's `{ error: { code, message } }` envelope.
 * Messages are redacted so credentials, signed URLs, and metadata endpoints never reach the model.
 *
 * @param err - The thrown value; non-Error inputs map to a generic runtime error.
 * @returns A tool result flagged with `isError` whose text is the JSON error envelope.
 */
export const toToolError = (err: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: categorize(err) }) }],
});

/**
 * Wraps a JSON-serializable value as a successful MCP tool result.
 *
 * @param value - Scan result, status, or rule metadata to return to the client.
 * @returns A tool result whose text content is compact JSON.
 */
export const toToolResult = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});
