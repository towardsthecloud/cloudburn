import { elastiCacheIdleClusterRule } from './idle-cluster.js';
import { elastiCacheNodeTypeCurrentGenRule } from './node-type-current-gen.js';
import { elastiCacheReservedCoverageRule } from './reserved-coverage.js';

/** Aggregate AWS ElastiCache rule definitions. */
export const elastiCacheRules = [
  elastiCacheReservedCoverageRule,
  elastiCacheIdleClusterRule,
  elastiCacheNodeTypeCurrentGenRule,
];
