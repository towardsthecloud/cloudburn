/**
 * Parses an ElastiCache node type such as `cache.m4.large` into its family prefix and size.
 *
 * @param cacheNodeType - Raw node type string, for example `cache.r7g.xlarge`.
 * @returns The `cache.<family>` prefix and the size segment, or `null` when the value does not
 * follow the `cache.<family>.<size>` shape.
 */
export const parseElastiCacheNodeType = (cacheNodeType: string): { family: string; size: string } | null => {
  const match = /^(cache\.[^.]+)\.(.+)$/u.exec(cacheNodeType);
  const family = match?.[1];
  const size = match?.[2];

  if (!family || !size) {
    return null;
  }

  return { family, size };
};
