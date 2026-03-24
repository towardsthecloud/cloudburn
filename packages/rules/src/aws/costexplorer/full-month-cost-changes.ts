import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-COSTEXPLORER-1';
const RULE_SERVICE = 'costexplorer';
const RULE_MESSAGE =
  'AWS services with cost increases greater than 10 USD between the last two full months should be reviewed.';
// Match the upstream Thrifty default and only flag material month-over-month increases above ten cost units.
const COST_INCREASE_THRESHOLD = 10;

/** Flag AWS services whose spend increased materially between the last two full months. */
export const costExplorerFullMonthCostChangesRule = createRule({
  id: RULE_ID,
  name: 'Cost Explorer Full Month Cost Changes',
  description: 'Flag services with significant cost increases between the last two full months.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-usage'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-cost-usage')
      .filter((service) => service.previousMonthCost > 0 && service.costIncrease > COST_INCREASE_THRESHOLD)
      .map((service) => createFindingMatch(`cost/${service.serviceSlug}`, undefined, service.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
