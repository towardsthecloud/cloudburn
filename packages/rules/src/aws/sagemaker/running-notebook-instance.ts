import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-SAGEMAKER-1';
const RULE_SERVICE = 'sagemaker';
const RULE_MESSAGE = 'SageMaker notebook instances should not remain running when they are no longer needed.';

/** Flag SageMaker notebook instances that are currently in service. */
export const sagemakerRunningNotebookInstanceRule = createRule({
  id: RULE_ID,
  name: 'SageMaker Notebook Instance Running',
  description: 'Flag SageMaker notebook instances whose status remains InService.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-sagemaker-notebook-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-sagemaker-notebook-instances')
      .filter((instance) => instance.notebookInstanceStatus === 'InService')
      .map((instance) => createFindingMatch(instance.notebookInstanceName, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
