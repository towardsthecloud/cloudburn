import { cloudWatchLogGroupNoMetricFiltersRule } from './log-group-no-metric-filters.js';
import { cloudWatchLogGroupRetentionRule } from './log-group-retention.js';
import { cloudWatchUnusedLogStreamsRule } from './unused-log-streams.js';

/** Aggregate AWS CloudWatch rule definitions. */
export const cloudwatchRules = [
  cloudWatchLogGroupRetentionRule,
  cloudWatchUnusedLogStreamsRule,
  cloudWatchLogGroupNoMetricFiltersRule,
];
