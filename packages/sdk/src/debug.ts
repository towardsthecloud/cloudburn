/**
 * Emits an SDK debug line when a logger is configured.
 *
 * @param debugLogger - Optional logger callback provided by the caller.
 * @param message - Human-readable trace message.
 * @returns Nothing.
 */
export const emitDebugLog = (debugLogger: ((message: string) => void) | undefined, message: string): void => {
  debugLogger?.(message);
};
