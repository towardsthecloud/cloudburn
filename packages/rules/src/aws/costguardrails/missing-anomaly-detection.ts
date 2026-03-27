import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-COSTGUARDRAILS-2';
const RULE_SERVICE = 'costguardrails';
const RULE_MESSAGE = 'AWS accounts should enable Cost Anomaly Detection monitors for spend spikes.';

/** Flag accounts that have not configured any Cost Anomaly Detection monitors. */
export const costGuardrailMissingAnomalyDetectionRule = createRule({
  id: RULE_ID,
  name: 'Cost Anomaly Detection Missing',
  description: 'Flag AWS accounts that do not have any Cost Anomaly Detection monitors configured.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-anomaly-monitors'],
  evaluateLive: ({ resources }) => {
    const monitorSummary = resources.get('aws-cost-anomaly-monitors')[0];

    if (!monitorSummary || monitorSummary.monitorCount > 0) {
      return null;
    }

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', [
      createFindingMatch(monitorSummary.accountId, undefined, monitorSummary.accountId),
    ]);
  },
});
