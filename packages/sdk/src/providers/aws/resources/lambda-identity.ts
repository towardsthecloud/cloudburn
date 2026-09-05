/**
 * Removes a Lambda version or alias qualifier for function-level finding identity.
 * @param functionArn - Function ARN returned by an AWS recommendation source.
 * @returns The unqualified ARN, or the original value without a function marker.
 */
export const getUnqualifiedLambdaFunctionArn = (functionArn: string): string => {
  const functionMarker = ':function:';
  const functionMarkerIndex = functionArn.indexOf(functionMarker);
  if (functionMarkerIndex < 0) return functionArn;
  const qualifierIndex = functionArn.indexOf(':', functionMarkerIndex + functionMarker.length);
  return qualifierIndex < 0 ? functionArn : functionArn.slice(0, qualifierIndex);
};
