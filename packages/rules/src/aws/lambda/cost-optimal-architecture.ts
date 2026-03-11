import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-1';
const RULE_SERVICE = 'lambda';
const RULE_MESSAGE = 'Lambda functions should use arm64 architecture when compatible to reduce running costs.';

type ArchitectureState = 'arm64' | 'non-arm64' | 'unknown';

const getArchitectureState = (architectures: unknown): ArchitectureState => {
  if (architectures === undefined) {
    return 'non-arm64';
  }

  if (!Array.isArray(architectures) || !architectures.every((architecture) => typeof architecture === 'string')) {
    return 'unknown';
  }

  return architectures.includes('arm64') ? 'arm64' : 'non-arm64';
};

/** Flag Lambda functions that are not configured for arm64, as an advisory when compatible. */
export const lambdaCostOptimalArchitectureRule = createRule({
  id: RULE_ID,
  name: 'Lambda Function Not Using Cost-Optimal Architecture',
  description: 'Recommend arm64 architecture when compatible.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-lambda-functions'],
  staticDependencies: ['aws-lambda-functions'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-lambda-functions')
      .filter((fn) => !fn.architectures.includes('arm64'))
      .map((fn) => createFindingMatch(fn.functionName, fn.region, fn.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-lambda-functions')
      .filter((fn) => getArchitectureState(fn.architectures) === 'non-arm64')
      .map((fn) => createFindingMatch(fn.resourceId, undefined, undefined, fn.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
