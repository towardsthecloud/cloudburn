import {
  createFinding,
  createFindingMatch,
  createRule,
  createStaticFindingMatch,
  isRecord,
} from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-1';
const RULE_SERVICE = 'lambda';
const RULE_MESSAGE = 'Lambda functions should use arm64 architecture when compatible to reduce running costs.';
const TERRAFORM_LAMBDA_TYPE = 'aws_lambda_function';
const CLOUDFORMATION_LAMBDA_TYPE = 'AWS::Lambda::Function';

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
  liveDiscovery: {
    hydrator: 'aws-lambda-function',
    resourceTypes: ['lambda:function'],
  },
  evaluateLive: ({ lambdaFunctions }) => {
    const findings = lambdaFunctions
      .filter((fn) => !fn.architectures.includes('arm64'))
      .map((fn) => createFindingMatch(fn.functionName, fn.region, fn.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ iacResources }) => {
    const findings = iacResources.flatMap((resource) => {
      if (resource.provider !== 'aws') {
        return [];
      }

      if (
        resource.type === TERRAFORM_LAMBDA_TYPE &&
        getArchitectureState(resource.attributes.architectures) === 'non-arm64'
      ) {
        return [
          createStaticFindingMatch(resource, `${resource.type}.${resource.name}`, [
            'architectures',
            'Properties.Architectures',
          ]),
        ];
      }

      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      if (
        resource.type === CLOUDFORMATION_LAMBDA_TYPE &&
        properties &&
        getArchitectureState(properties.Architectures) === 'non-arm64'
      ) {
        return [createStaticFindingMatch(resource, resource.name, ['architectures', 'Properties.Architectures'])];
      }

      return [];
    });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
