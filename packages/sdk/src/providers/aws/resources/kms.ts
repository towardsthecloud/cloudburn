import { createHash } from 'node:crypto';
import {
  DescribeKeyCommand,
  GetKeyLastUsageCommand,
  type KeyMetadata,
  ListAliasesCommand,
  ListKeyRotationsCommand,
} from '@aws-sdk/client-kms';
import type { AwsDiscoveredResource, AwsKmsKeyChurnReview } from '@cloudburn/rules';
import type { ScanDiagnostic } from '../../../types.js';
import { createKmsClient } from '../client.js';
import type { AwsDiscoveryDatasetLoadResult } from '../discovery-registry.js';
import { formatAwsAccessDeniedReason, getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import {
  addUtcMonths,
  extractTerminalArnResourceIdentifier,
  mapWithConcurrency,
  toUtcMonthBoundary,
  withAwsServiceErrorContext,
} from './utils.js';

const KMS_KEY_CONCURRENCY = 10;
const KMS_KEY_MONTHLY_STORAGE_PRICE_USD = 1;
const KMS_BILLED_ROTATION_LIMIT = 2;
const MIN_ALIAS_COHORT_PREFIX_TOKENS = 2;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const LONG_IDENTIFIER_PATTERN = /\b(?=[a-z0-9]*\d)[a-z0-9]{12,}\b/giu;
const HEX_IDENTIFIER_PATTERN = /\b[0-9a-f]{8,}\b/giu;
const NUMBER_PATTERN = /\b\d+\b/gu;
const EPHEMERAL_ALIAS_SUFFIX_PATTERN = /(^|[-_/])(branch|pr|preview|pull|review|test)(?:[-_/].*)?$/gu;

type KmsUsageEvidence = 'no_kms_usage_since_creation' | 'unavailable' | 'unobserved_before_tracking' | 'used';

type HydratedKmsKey = {
  creationDate: Date;
  keyId: string;
  multiRegion: boolean;
  rotationCount?: number;
  rotationError?: unknown;
  usageEvidence: KmsUsageEvidence;
  usageError?: unknown;
};

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

const createMetadataDeniedDiagnostic = (options: {
  count: number;
  error: unknown;
  label: string;
  region: string;
  subject: string;
}): ScanDiagnostic => ({
  code: getAwsErrorCode(options.error),
  details: options.error instanceof Error ? options.error.message : String(options.error),
  message: `KMS ${options.label} metadata was unavailable for ${options.count} ${pluralize(options.count, options.subject)} in ${options.region} because access is denied by ${formatAwsAccessDeniedReason(options.error)}.`,
  provider: 'aws',
  region: options.region,
  service: 'kms',
  source: 'discovery',
  status: 'access_denied',
});

const getPreviousFullMonthWindow = (now: Date): { end: Date; start: Date } => {
  const end = toUtcMonthBoundary(now);
  const start = addUtcMonths(end, -1);

  return { end, start };
};

const normalizeAliasPattern = (alias: string): string =>
  alias
    .replace(/^alias\//u, '')
    .toLowerCase()
    .replace(UUID_PATTERN, '{id}')
    .replace(LONG_IDENTIFIER_PATTERN, '{id}')
    .replace(HEX_IDENTIFIER_PATTERN, '{id}')
    .replace(NUMBER_PATTERN, '{n}')
    .replace(EPHEMERAL_ALIAS_SUFFIX_PATTERN, '$1$2-{id}')
    .replace(/[_./]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');

const createAliasPatternCandidates = (alias: string): string[] => {
  const normalizedPattern = normalizeAliasPattern(alias);
  const tokens = normalizedPattern.split('-').filter(Boolean);

  if (tokens.length < MIN_ALIAS_COHORT_PREFIX_TOKENS) {
    return [normalizedPattern];
  }

  return Array.from({ length: tokens.length - MIN_ALIAS_COHORT_PREFIX_TOKENS + 1 }, (_, index) =>
    tokens.slice(0, index + MIN_ALIAS_COHORT_PREFIX_TOKENS).join('-'),
  );
};

const toAliasPatternId = (normalizedPattern: string): string =>
  `pattern-${createHash('sha256').update(normalizedPattern).digest('hex').slice(0, 12)}`;

const listAliasPatternsByKey = async (
  client: ReturnType<typeof createKmsClient>,
  region: string,
): Promise<Map<string, string[]>> => {
  const aliases: Array<{ candidates: string[]; keyId: string }> = [];
  let marker: string | undefined;

  do {
    const response = await withAwsServiceErrorContext('AWS KMS', 'ListAliases', region, () =>
      client.send(new ListAliasesCommand({ Marker: marker })),
    );

    for (const alias of response.Aliases ?? []) {
      if (!alias.TargetKeyId || !alias.AliasName || alias.AliasName.startsWith('alias/aws/')) {
        continue;
      }

      aliases.push({
        candidates: createAliasPatternCandidates(alias.AliasName),
        keyId: alias.TargetKeyId,
      });
    }

    marker = response.Truncated ? response.NextMarker : undefined;
  } while (marker);

  const keysByCandidate = new Map<string, Set<string>>();

  for (const alias of aliases) {
    for (const candidate of alias.candidates) {
      const keyIds = keysByCandidate.get(candidate) ?? new Set<string>();
      keyIds.add(alias.keyId);
      keysByCandidate.set(candidate, keyIds);
    }
  }

  const patternsByKey = new Map<string, Set<string>>();
  const patternIds = new Map<string, string>();

  for (const alias of aliases) {
    const cohortPattern = alias.candidates.findLast((candidate) => (keysByCandidate.get(candidate)?.size ?? 0) > 1);

    if (!cohortPattern) {
      continue;
    }

    const patterns = patternsByKey.get(alias.keyId) ?? new Set<string>();
    let patternId = patternIds.get(cohortPattern);

    if (!patternId) {
      patternId = toAliasPatternId(cohortPattern);
      patternIds.set(cohortPattern, patternId);
    }

    patterns.add(patternId);
    patternsByKey.set(alias.keyId, patterns);
  }

  return new Map([...patternsByKey].map(([keyId, patterns]) => [keyId, [...patterns].sort()]));
};

const listRotationCount = async (
  client: ReturnType<typeof createKmsClient>,
  keyId: string,
  region: string,
): Promise<number> => {
  let marker: string | undefined;
  let rotationCount = 0;

  do {
    const response = await withAwsServiceErrorContext('AWS KMS', 'ListKeyRotations', region, () =>
      client.send(new ListKeyRotationsCommand({ KeyId: keyId, Marker: marker })),
    );
    rotationCount += response.Rotations?.length ?? 0;
    marker = response.Truncated ? response.NextMarker : undefined;
  } while (marker);

  return rotationCount;
};

const supportsRotationHistory = (metadata: KeyMetadata): boolean =>
  metadata.KeySpec === 'SYMMETRIC_DEFAULT' &&
  metadata.KeyUsage === 'ENCRYPT_DECRYPT' &&
  metadata.Origin === 'AWS_KMS' &&
  metadata.CustomKeyStoreId === undefined;

const loadRotationEvidence = async (
  client: ReturnType<typeof createKmsClient>,
  keyId: string,
  metadata: KeyMetadata,
  region: string,
): Promise<{ count?: number; error?: unknown }> => {
  if (!supportsRotationHistory(metadata)) {
    return { count: 0 };
  }

  try {
    return { count: await listRotationCount(client, keyId, region) };
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    return { error: err };
  }
};

const loadUsageEvidence = async (
  client: ReturnType<typeof createKmsClient>,
  keyId: string,
  creationDate: Date,
  region: string,
): Promise<{ evidence: KmsUsageEvidence; error?: unknown }> => {
  try {
    const response = await withAwsServiceErrorContext('AWS KMS', 'GetKeyLastUsage', region, () =>
      client.send(new GetKeyLastUsageCommand({ KeyId: keyId })),
    );

    if (response.KeyLastUsage?.Timestamp) {
      return { evidence: 'used' };
    }

    if (!response.TrackingStartDate) {
      return { evidence: 'unavailable' };
    }

    return {
      evidence:
        creationDate.getTime() >= response.TrackingStartDate.getTime()
          ? 'no_kms_usage_since_creation'
          : 'unobserved_before_tracking',
    };
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    return { evidence: 'unavailable', error: err };
  }
};

const hydrateKey = async (
  client: ReturnType<typeof createKmsClient>,
  resource: AwsDiscoveredResource,
): Promise<{ key?: HydratedKmsKey; metadataError?: unknown }> => {
  const keyId = extractTerminalArnResourceIdentifier(resource.arn);

  if (!keyId) {
    return {};
  }

  let metadata: KeyMetadata | undefined;

  try {
    const response = await withAwsServiceErrorContext('AWS KMS', 'DescribeKey', resource.region, () =>
      client.send(new DescribeKeyCommand({ KeyId: keyId })),
    );
    metadata = response.KeyMetadata;
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    return { metadataError: err };
  }

  if (
    !metadata?.CreationDate ||
    metadata.KeyManager !== 'CUSTOMER' ||
    metadata.KeyState !== 'Enabled' ||
    metadata.DeletionDate !== undefined
  ) {
    return {};
  }

  const [usage, rotation] = await Promise.all([
    loadUsageEvidence(client, keyId, metadata.CreationDate, resource.region),
    loadRotationEvidence(client, keyId, metadata, resource.region),
  ]);

  return {
    key: {
      creationDate: metadata.CreationDate,
      keyId,
      multiRegion: metadata.MultiRegion === true,
      rotationCount: rotation.count,
      rotationError: rotation.error,
      usageEvidence: usage.evidence,
      usageError: usage.error,
    },
  };
};

const createReview = (
  accountId: string,
  region: string,
  keys: HydratedKmsKey[],
  aliasPatternsByKey: Map<string, string[]>,
  aliasPatternsAvailable: boolean,
  keyMetadataUnavailableCount: number,
): AwsKmsKeyChurnReview => {
  const creationWindow = getPreviousFullMonthWindow(new Date());
  const aliasPatternCounts = new Map<string, number>();
  const usageCounts: Record<KmsUsageEvidence, number> = {
    no_kms_usage_since_creation: 0,
    unavailable: 0,
    unobserved_before_tracking: 0,
    used: 0,
  };
  let estimatedMonthlyStorageCostUsd = 0;
  let keysCreatedInWindow = 0;
  let multiRegionKeyCount = 0;
  let rotatedKeyCount = 0;
  let storageCostEstimateComplete = true;

  for (const key of keys) {
    for (const patternId of aliasPatternsByKey.get(key.keyId) ?? []) {
      aliasPatternCounts.set(patternId, (aliasPatternCounts.get(patternId) ?? 0) + 1);
    }

    estimatedMonthlyStorageCostUsd +=
      KMS_KEY_MONTHLY_STORAGE_PRICE_USD * (1 + Math.min(key.rotationCount ?? 0, KMS_BILLED_ROTATION_LIMIT));
    keysCreatedInWindow += Number(key.creationDate >= creationWindow.start && key.creationDate < creationWindow.end);
    multiRegionKeyCount += Number(key.multiRegion);
    rotatedKeyCount += Number((key.rotationCount ?? 0) > 0);
    storageCostEstimateComplete &&= key.rotationCount !== undefined;
    usageCounts[key.usageEvidence] += 1;
  }

  return {
    accountId,
    aliasPatternGroups: [...aliasPatternCounts]
      .filter(([, keyCount]) => keyCount > 1)
      .map(([patternId, keyCount]) => ({ keyCount, patternId }))
      .sort((left, right) => right.keyCount - left.keyCount || left.patternId.localeCompare(right.patternId)),
    aliasPatternsAvailable,
    creationWindowEnd: creationWindow.end.toISOString(),
    creationWindowStart: creationWindow.start.toISOString(),
    enabledCustomerManagedKeyCount: keys.length,
    estimatedMonthlyStorageCostUsd,
    keyMetadataComplete: keyMetadataUnavailableCount === 0,
    keyMetadataUnavailableCount,
    keysCreatedInWindow,
    multiRegionKeyCount,
    noKmsUsageSinceCreationKeyCount: usageCounts.no_kms_usage_since_creation,
    region,
    reviewId: `kms-key-churn/${region}`,
    rotatedKeyCount,
    storageCostEstimateComplete,
    unobservedBeforeTrackingKeyCount: usageCounts.unobserved_before_tracking,
    usageMetadataUnavailableKeyCount: usageCounts.unavailable,
    usedKeyCount: usageCounts.used,
  };
};

/**
 * Hydrates discovered KMS keys into regional proliferation and previous-full-month churn evidence.
 *
 * Raw alias values are normalized and hashed before aggregation. Usage tracking is retained only as
 * summary counts, so the dataset cannot identify individual keys as safe deletion candidates.
 *
 * @param resources - Resource Explorer KMS key inventory selected for the active discovery scope.
 * @returns Regional KMS key churn reviews plus non-fatal diagnostics for partially denied metadata.
 */
export const hydrateAwsKmsKeyChurnReviews = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsKmsKeyChurnReview[] | AwsDiscoveryDatasetLoadResult<'aws-kms-key-churn-reviews'>> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const loadedRegions = await Promise.all(
    [...resourcesByRegion].map(async ([region, regionResources]) => {
      const client = createKmsClient({ region });
      const diagnostics: ScanDiagnostic[] = [];
      const aliasPatternsPromise = listAliasPatternsByKey(client, region)
        .then((patterns) => ({ available: true as const, patterns }))
        .catch((err: unknown) => {
          if (!isAwsAccessDeniedError(err)) {
            throw err;
          }

          return {
            available: false as const,
            error: err,
            patterns: new Map<string, string[]>(),
          };
        });
      const [aliasPatterns, hydrated] = await Promise.all([
        aliasPatternsPromise,
        mapWithConcurrency(regionResources, KMS_KEY_CONCURRENCY, (resource) => hydrateKey(client, resource)),
      ]);
      const keys = hydrated.flatMap((result) => (result.key ? [result.key] : []));
      const metadataErrors = hydrated.flatMap((result) => (result.metadataError ? [result.metadataError] : []));
      const usageErrors = keys.flatMap((key) => (key.usageError ? [key.usageError] : []));
      const rotationErrors = keys.flatMap((key) => (key.rotationError ? [key.rotationError] : []));

      if (!aliasPatterns.available) {
        diagnostics.push(
          createMetadataDeniedDiagnostic({
            count: regionResources.length,
            error: aliasPatterns.error,
            label: 'alias',
            region,
            subject: 'discovered key',
          }),
        );
      }

      if (keys.length === 0 && metadataErrors.length > 0) {
        throw metadataErrors[0];
      }

      for (const { errors, label, subject } of [
        { errors: metadataErrors, label: 'key', subject: 'discovered key' },
        { errors: usageErrors, label: 'last-usage', subject: 'enabled customer-managed key' },
        { errors: rotationErrors, label: 'rotation', subject: 'enabled customer-managed key' },
      ]) {
        if (errors[0]) {
          diagnostics.push(
            createMetadataDeniedDiagnostic({
              count: errors.length,
              error: errors[0],
              label,
              region,
              subject,
            }),
          );
        }
      }

      return {
        diagnostics,
        reviews:
          keys.length > 0
            ? [
                createReview(
                  regionResources[0]?.accountId ?? '',
                  region,
                  keys,
                  aliasPatterns.patterns,
                  aliasPatterns.available,
                  metadataErrors.length,
                ),
              ]
            : [],
      };
    }),
  );

  const diagnostics = loadedRegions.flatMap((loadedRegion) => loadedRegion.diagnostics);
  const reviews = loadedRegions
    .flatMap((loadedRegion) => loadedRegion.reviews)
    .sort((left, right) => left.region.localeCompare(right.region));

  return diagnostics.length > 0 ? { diagnostics, resources: reviews } : reviews;
};
