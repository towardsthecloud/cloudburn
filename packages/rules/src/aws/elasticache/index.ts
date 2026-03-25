import { elastiCacheIdleClusterRule } from './idle-cluster.js';
import { elastiCacheReservedCoverageRule } from './reserved-coverage.js';

/** Aggregate AWS ElastiCache rule definitions. */
export const elastiCacheRules = [elastiCacheReservedCoverageRule, elastiCacheIdleClusterRule];
