import { costGuardrailMissingAnomalyDetectionRule } from './missing-anomaly-detection.js';
import { costGuardrailMissingBudgetsRule } from './missing-budgets.js';

/** Aggregate AWS cost guardrail rule definitions. */
export const costguardrailsRules = [costGuardrailMissingBudgetsRule, costGuardrailMissingAnomalyDetectionRule];
