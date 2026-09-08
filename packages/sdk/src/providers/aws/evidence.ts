import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { emitDebugLog } from '../../debug.js';
import {
  createEvidenceCache,
  type EvidenceCache,
  type EvidenceCacheLoad,
  type EvidenceCacheResult,
} from '../../evidence-cache.js';
import type { AwsDiscoveryTarget, AwsEvidenceCacheOptions, AwsEvidenceProvenance } from '../../types.js';
import {
  assertValidAwsRegion,
  resolveAwsCallerIdentity,
  resolveAwsEvidenceCredentials,
  resolveCurrentAwsRegion,
  withAwsClientCredentials,
} from './client.js';
import {
  getAwsDiscoveryTimestamp,
  getAwsExecutionSignal,
  runOutsideAwsExecution,
  throwIfAwsExecutionAborted,
  withAwsDiscoveryExecution,
} from './execution.js';
import { withAwsServiceCallBudget } from './request.js';

type EvidenceContext = {
  cache: EvidenceCache;
  options: AwsEvidenceCacheOptions;
  scope?: { partition: string; accountId: string; authorization: string; target: AwsDiscoveryTarget };
  evidence: Map<string, AwsEvidenceProvenance>;
  debugLogger?: (message: string) => void;
};
type EvidencePayload<T> = { data: T; supporting: Array<[string, AwsEvidenceProvenance]> };
const context = new AsyncLocalStorage<EvidenceContext>();

/**
 * Fingerprints normalized scope or evidence without retaining credential material.
 * @param value - JSON-compatible identity with stable object key ordering.
 * @returns A SHA-256 digest.
 */
export const fingerprintAwsEvidence = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Configures explicit reusable evidence under a resolved, immutable credential session.
 * @param options - Cache policy, selected target, and diagnostic logger.
 * @param run - Scan whose rules are evaluated independently of evidence reuse.
 * @returns The scan result under its own authorization context.
 */
export const withAwsEvidenceCache = async <T>(
  options: { cache?: AwsEvidenceCacheOptions; target: AwsDiscoveryTarget; debugLogger?: (message: string) => void },
  run: () => Promise<T>,
): Promise<T> => {
  if (!options.cache) return run();
  const settings = options.cache;
  for (const ttl of [
    settings.ttlMs?.catalog,
    settings.ttlMs?.pricing,
    ...Object.values(settings.ttlMs?.datasets ?? {}),
  ]) {
    if (ttl !== undefined && (!Number.isSafeInteger(ttl) || ttl < 0)) {
      throw new RangeError('Evidence freshness must be a non-negative integer in milliseconds.');
    }
  }
  if (settings.authorizationContext !== undefined && !settings.authorizationContext.trim()) {
    throw new Error('Evidence authorizationContext must be non-empty.');
  }
  const execution: EvidenceContext = {
    cache: createEvidenceCache(settings),
    options: settings,
    evidence: new Map(),
    debugLogger: options.debugLogger,
  };
  if (settings.mode === 'off') return context.run(execution, run);
  const target = options.target;
  const region = target.mode === 'region' ? target.region : target.mode === 'regions' ? target.regions[0] : undefined;
  const controlRegion = assertValidAwsRegion(region ?? (await resolveCurrentAwsRegion()));
  const credentials = await resolveAwsEvidenceCredentials(controlRegion);
  if (credentials.expiration && credentials.expiration.getTime() <= Date.now()) {
    throw new Error('Cannot reuse evidence with expired AWS credentials.');
  }
  return withAwsClientCredentials(credentials, async () => {
    // Session tokens distinguish sessions sharing an account and role, including different session policies.
    // Persistent IAM-policy changes still require an explicit context revision or strict refresh.
    if (credentials.sessionToken || settings.authorizationContext) {
      const identity = await resolveAwsCallerIdentity(controlRegion).catch(() => {
        throwIfAwsExecutionAborted();
        return undefined;
      });
      const partition = identity?.arn?.split(':')[1];
      if (partition && identity) {
        execution.scope = {
          partition,
          accountId: identity.accountId,
          authorization: fingerprintAwsEvidence([
            credentials.accessKeyId,
            credentials.sessionToken,
            settings.authorizationContext,
          ]),
          target:
            target.mode === 'all'
              ? target
              : {
                  mode: 'regions',
                  regions: target.mode === 'regions' ? [...new Set(target.regions)].sort() : [controlRegion],
                },
        };
      }
    }
    if (!execution.scope)
      emitDebugLog(options.debugLogger, 'aws: customer evidence reuse disabled; no safe authorization scope');
    return context.run(execution, run);
  });
};

/** Returns whether reusable evidence is explicitly enabled for this artifact's scope. */
export const isAwsEvidenceCacheEnabled = (publicEvidence = false): boolean => {
  const execution = context.getStore();
  return !!execution && execution.options.mode !== 'off' && (publicEvidence || !!execution.scope);
};

/**
 * Resolves caller freshness overrides for catalog, public pricing, or a dataset.
 * @param datasetKey - Artifact identity; catalog and public-pricing prefixes identify shared policies.
 * @param defaultTtlMs - Registry's proposed freshness duration.
 * @returns The configured duration in milliseconds.
 */
export const getAwsEvidenceTtl = (datasetKey: string, defaultTtlMs: number): number => {
  const settings = context.getStore()?.options.ttlMs;
  return (
    (datasetKey.startsWith('catalog')
      ? settings?.catalog
      : datasetKey.startsWith('public-pricing')
        ? settings?.pricing
        : settings?.datasets?.[datasetKey]) ?? defaultTtlMs
  );
};

/**
 * Loads normalized evidence with independent refresh ownership and records its provenance.
 * @param request - Versioned artifact identity, completeness contract, and normalized loader.
 * @returns Evidence and its dependency fingerprint, never live AWS clients or credentials.
 */
export const loadAwsCachedEvidence = async <T>(request: {
  key: unknown;
  datasetKey: string;
  region?: string;
  ttlMs: number;
  public?: boolean;
  observationTimestamp?: number;
  load: () => Promise<EvidenceCacheLoad<T>>;
  validate?: (value: unknown) => value is T;
}): Promise<EvidenceCacheResult<T>> => {
  const execution = context.getStore();
  const enabled = isAwsEvidenceCacheEnabled(request.public);
  const cache = execution?.cache ?? createEvidenceCache();
  const key = ['aws-evidence-v1', request.public ? 'public' : execution?.scope, request.key];
  const timestamp = request.observationTimestamp ?? getAwsDiscoveryTimestamp();
  const collect = async () => {
    const supporting = new Map<string, AwsEvidenceProvenance>();
    const loaded = execution
      ? await context.run({ ...execution, evidence: supporting }, request.load)
      : await request.load();
    return { ...loaded, value: { data: loaded.value, supporting: [...supporting.entries()] } };
  };
  const work = cache.load({
    key,
    ttlMs: request.ttlMs,
    mode: enabled ? execution?.options.mode : 'off',
    signal: getAwsExecutionSignal(),
    validate: (value): value is EvidencePayload<T> => {
      if (
        !value ||
        typeof value !== 'object' ||
        !('data' in value) ||
        !('supporting' in value) ||
        !Array.isArray(value.supporting)
      )
        return false;
      return (
        (!request.validate || request.validate(value.data)) &&
        value.supporting.every(
          (entry) => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1]?.datasetKey === 'string',
        )
      );
    },
    load: (signal) =>
      enabled
        ? runOutsideAwsExecution(() =>
            withAwsDiscoveryExecution(
              { signal, observationTimestamp: timestamp, debugLogger: execution?.debugLogger },
              () =>
                withAwsServiceCallBudget(collect, {
                  accountId: execution?.scope?.accountId,
                  attribution: { dataset: request.datasetKey },
                }),
            ),
          )
        : collect(),
  });
  emitDebugLog(
    execution?.debugLogger,
    `aws: evidence lookup ${request.datasetKey}${request.region ? ` in ${request.region}` : ''}`,
  );
  const identity = { datasetKey: request.datasetKey, ...(request.region ? { region: request.region } : {}) };
  try {
    const result = await work;
    for (const [supportingKey, provenance] of result.value.supporting) {
      execution?.evidence.set(
        supportingKey,
        result.provenance.source === 'cache' ? { ...provenance, source: 'cache', cacheStatus: 'hit' } : provenance,
      );
    }
    execution?.evidence.set(fingerprintAwsEvidence(key), { ...result.provenance, ...identity });
    return { ...result, value: result.value.data };
  } catch (error) {
    execution?.evidence.set(fingerprintAwsEvidence(key), {
      ...identity,
      source: 'live',
      complete: false,
      collectedAt: new Date().toISOString(),
      observedAt: new Date(timestamp).toISOString(),
      cacheStatus: enabled ? (execution?.options.mode === 'refresh' ? 'refresh' : 'miss') : 'off',
    });
    throw error;
  }
};

/** Returns collection provenance accumulated in this scan, independent of rule selection. */
export const getAwsEvidenceProvenance = (): AwsEvidenceProvenance[] | undefined => {
  const execution = context.getStore();
  return execution ? [...execution.evidence.values()] : undefined;
};

/**
 * Retains normalized resource coverage and diagnostics alongside dataset freshness.
 * @param datasetKey - Dataset whose latest artifact was loaded in this region.
 * @param region - Regional scope, or undefined for account-wide evidence.
 * @param details - Completeness details restored from the cached payload.
 * @returns Nothing.
 */
export const annotateAwsEvidence = (
  datasetKey: string,
  region: string | undefined,
  details: Pick<AwsEvidenceProvenance, 'coverage' | 'diagnostics'>,
): void => {
  for (const evidence of context.getStore()?.evidence.values() ?? []) {
    if (evidence.datasetKey === datasetKey && evidence.region === region) Object.assign(evidence, details);
  }
};
