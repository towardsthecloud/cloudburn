import { redshiftLowCpuRule } from './low-cpu.js';
import { redshiftPauseResumeRule } from './pause-resume.js';
import { redshiftReservedCoverageRule } from './reserved-coverage.js';

/** Aggregate AWS Redshift rule definitions. */
export const redshiftRules = [redshiftLowCpuRule, redshiftReservedCoverageRule, redshiftPauseResumeRule];
