import { rdsGravitonReviewRule } from './graviton-review.js';
import { rdsIdleInstanceRule } from './idle-instance.js';
import { rdsLowCpuUtilizationRule } from './low-cpu-utilization.js';
import { rdsPerformanceInsightsExtendedRetentionRule } from './performance-insights-extended-retention.js';
import { rdsPreferredInstanceClassRule } from './preferred-instance-classes.js';
import { rdsReservedCoverageRule } from './reserved-coverage.js';
import { rdsUnsupportedEngineVersionRule } from './unsupported-engine-version.js';
import { rdsUnusedSnapshotsRule } from './unused-snapshots.js';

// Intent: aggregate AWS RDS rule definitions.
// TODO(cloudburn): add idle-instance and single-AZ production checks.
export const rdsRules = [
  rdsPreferredInstanceClassRule,
  rdsIdleInstanceRule,
  rdsReservedCoverageRule,
  rdsGravitonReviewRule,
  rdsLowCpuUtilizationRule,
  rdsUnsupportedEngineVersionRule,
  rdsUnusedSnapshotsRule,
  rdsPerformanceInsightsExtendedRetentionRule,
];
