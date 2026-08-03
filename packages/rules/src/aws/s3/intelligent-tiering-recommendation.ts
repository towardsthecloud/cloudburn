import { createFinding, createRule } from '../../shared/helpers.js';
import {
  createLiveS3BucketFindingMatch,
  createStaticS3BucketFindingMatch,
  shouldRecommendIntelligentTiering,
} from './shared.js';

const RULE_ID = 'CLDBRN-AWS-S3-5';
const RULE_SERVICE = 's3';
const RULE_SEVERITY = 'low' as const;
const RULE_MESSAGE =
  'S3 buckets without any storage-class transition should enable Intelligent-Tiering when access patterns are unknown.';

/** Flag S3 buckets with no lifecycle configuration and no Intelligent-Tiering configuration. */
export const s3IntelligentTieringRecommendationRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'S3 Bucket Without Intelligent-Tiering',
  description:
    'Recommend Intelligent-Tiering for buckets that declare no lifecycle configuration and no Intelligent-Tiering configuration.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-s3-bucket-analyses'],
  staticDependencies: ['aws-s3-bucket-analyses'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => shouldRecommendIntelligentTiering(bucket))
      .map((bucket) => createLiveS3BucketFindingMatch(bucket));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => shouldRecommendIntelligentTiering(bucket))
      .map((bucket) => createStaticS3BucketFindingMatch(bucket));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'iac',
      findings,
    );
  },
});
