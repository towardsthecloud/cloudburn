import { cloudWatchLogGroupRetentionRule } from './log-group-retention.js';
import { cloudWatchUnusedLogStreamsRule } from './unused-log-streams.js';

/** Aggregate AWS CloudWatch rule definitions. */
export const cloudwatchRules = [cloudWatchLogGroupRetentionRule, cloudWatchUnusedLogStreamsRule];
