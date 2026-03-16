import { cloudTrailRedundantGlobalTrailsRule } from './redundant-global-trails.js';
import { cloudTrailRedundantRegionalTrailsRule } from './redundant-regional-trails.js';

/** Aggregate AWS CloudTrail rule definitions. */
export const cloudtrailRules = [cloudTrailRedundantGlobalTrailsRule, cloudTrailRedundantRegionalTrailsRule];
