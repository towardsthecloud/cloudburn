/**
 * Decodes serialized AWS request bodies without invoking legacy string adapters.
 *
 * @param body - A string or UTF-8 byte array emitted by an AWS serializer.
 * @returns The request body as UTF-8 text.
 */
export const decodeRequestBody = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : new TextDecoder().decode(body);
