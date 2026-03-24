import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-SECRETSMANAGER-1';
const RULE_SERVICE = 'secretsmanager';
const RULE_MESSAGE =
  'Secrets Manager secrets that have not been accessed for more than 90 days should be deleted or reviewed.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Match the upstream Thrifty default that treats secrets unused for 90 days as review candidates.
const UNUSED_SECRET_DAYS = 90;

/** Flag Secrets Manager secrets that have never been used or have gone unused for the default threshold. */
export const secretsManagerSecretUnusedRule = createRule({
  id: RULE_ID,
  name: 'Secrets Manager Secret Unused',
  description: 'Flag Secrets Manager secrets not accessed within a threshold (default 90 days).',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-secretsmanager-secrets'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - UNUSED_SECRET_DAYS * DAY_MS;
    const findings = resources
      .get('aws-secretsmanager-secrets')
      .filter((secret) => {
        if (!secret.lastAccessedDate) {
          return true;
        }

        const lastAccessedAt = Date.parse(secret.lastAccessedDate);
        return !Number.isNaN(lastAccessedAt) && lastAccessedAt <= cutoff;
      })
      .map((secret) => createFindingMatch(secret.secretArn, secret.region, secret.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
