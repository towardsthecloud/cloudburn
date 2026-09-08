import { loadConfig } from './config/loader.js';
import { mergeConfig } from './config/merge.js';
import { emitDebugLog } from './debug.js';
import { runStaticScan } from './engine/run-static.js';
import { createMemoryEvidenceCacheStore, type EvidenceCacheStore } from './evidence-cache.js';
import { evaluateScanPolicy } from './policy.js';
import { withAwsClientCredentials } from './providers/aws/credentials.js';
import { throwIfAwsExecutionAborted, withAwsDiscoveryExecution } from './providers/aws/execution.js';
import type {
  AwsDiscoveryExecutionOptions,
  AwsDiscoveryInitialization,
  AwsDiscoveryProgressEvent,
  AwsDiscoveryStatus,
  AwsDiscoveryTarget,
  AwsEvidenceCacheOptions,
  AwsSupportedResourceType,
  CloudBurnConfig,
  ScanResult,
} from './types.js';

/**
 * High-level SDK facade for CloudBurn scans and config loading.
 */
export class CloudBurnClient {
  private evidenceStore?: EvidenceCacheStore;
  public constructor(private readonly options?: { debugLogger?: (message: string) => void }) {}

  /**
   * Merges runtime config overrides onto the loaded CloudBurn config.
   *
   * @param config - Optional runtime config overrides.
   * @param configPath - Optional explicit path to the config file on disk.
   * @returns The merged effective config for the requested operation.
   */
  private async getEffectiveConfig(config?: Partial<CloudBurnConfig>, configPath?: string): Promise<CloudBurnConfig> {
    emitDebugLog(
      this.options?.debugLogger,
      `sdk: loading config${configPath ? ` from ${configPath}` : ' from default search path'}`,
    );
    const loadedConfig = await this.loadConfig(configPath);
    emitDebugLog(this.options?.debugLogger, 'sdk: merged runtime config overrides');

    return mergeConfig(config, loadedConfig);
  }

  /**
   * Runs a static IaC scan against a file or directory.
   *
   * Terraform and CloudFormation inputs are auto-detected by the parser layer,
   * so callers only need to provide the path to the file or directory to scan.
   *
   * @param path - Terraform file, CloudFormation template, or directory to scan.
   * @param config - Optional config overrides merged onto the loaded config.
   * @param options - Optional SDK execution options.
   * @returns Grouped static scan findings.
   */
  public async scanStatic(
    path: string,
    config?: Partial<CloudBurnConfig>,
    options?: { configPath?: string },
  ): Promise<ScanResult> {
    emitDebugLog(this.options?.debugLogger, `sdk: starting static scan for ${path}`);
    const effectiveConfig = await this.getEffectiveConfig(config, options?.configPath);

    const result = await runStaticScan(path, effectiveConfig);
    const threshold = effectiveConfig.iac.failOn;

    return threshold === undefined ? result : { ...result, policy: evaluateScanPolicy(result, threshold) };
  }

  /**
   * Runs a live AWS discovery scan against a specific discovery target.
   *
   * @param options - Optional discovery target, config overrides, progress
   *   callback, and AWS credentials to use instead of the ambient credential
   *   provider chain. `signal` cancels the run; `timeoutMs` sets its total deadline
   *   (default five minutes). Cancelled or timed-out runs reject without a partial result.
   * @returns Grouped live scan findings.
   */
  public async discover(
    options?: AwsDiscoveryExecutionOptions & {
      target?: AwsDiscoveryTarget;
      config?: Partial<CloudBurnConfig>;
      configPath?: string;
      includeEvaluationResources?: boolean;
      onProgress?: (event: AwsDiscoveryProgressEvent) => void;
      cache?: AwsEvidenceCacheOptions;
    },
  ): Promise<ScanResult> {
    emitDebugLog(this.options?.debugLogger, 'sdk: starting live discovery scan');
    const run = async () => {
      const { runLiveScan } = await import('./engine/run-live.js');
      throwIfAwsExecutionAborted();
      const effectiveConfig = await this.getEffectiveConfig(options?.config, options?.configPath);
      const result = await runLiveScan(effectiveConfig, options?.target ?? { mode: 'current' }, {
        debugLogger: this.options?.debugLogger,
        includeEvaluationResources: options?.includeEvaluationResources,
        onProgress: options?.onProgress,
      });
      const threshold = effectiveConfig.discovery.failOn;

      return threshold === undefined ? result : { ...result, policy: evaluateScanPolicy(result, threshold) };
    };

    const target = options?.target;
    const region =
      target?.mode === 'region' ? target.region : target?.mode === 'regions' ? target.regions[0] : undefined;
    const cache = options?.cache;
    if (cache && !cache.directory && !cache.store) this.evidenceStore ??= createMemoryEvidenceCacheStore();
    const cacheSettings = cache && !cache.directory && !cache.store ? { ...cache, store: this.evidenceStore } : cache;
    return this.runDiscoveryOperation(
      options,
      async () => {
        const { withAwsEvidenceCache } = await import('./providers/aws/evidence.js');
        throwIfAwsExecutionAborted();
        return withAwsEvidenceCache(
          {
            cache: cacheSettings,
            target: target ?? { mode: 'current' },
            debugLogger: this.options?.debugLogger,
          },
          run,
        );
      },
      region,
    );
  }

  /** Owns credentials, clients, deadlines, and the request budget for one public operation. */
  private runDiscoveryOperation<T>(
    options: AwsDiscoveryExecutionOptions | undefined,
    run: () => Promise<T>,
    region?: string,
  ): Promise<T> {
    return withAwsDiscoveryExecution(
      { signal: options?.signal, timeoutMs: options?.timeoutMs, debugLogger: this.options?.debugLogger },
      async () => {
        const [{ resolveAwsAccountId, resolveCurrentAwsRegion }, { withAwsServiceCallBudget }] = await Promise.all([
          import('./providers/aws/client.js'),
          import('./providers/aws/request.js'),
        ]);
        // Loading can outlive cancellation. Never start credentials or work after it settles.
        throwIfAwsExecutionAborted();
        const execute = () =>
          withAwsServiceCallBudget(run, {
            resolveAccountId: async () => resolveAwsAccountId(region ?? (await resolveCurrentAwsRegion())),
          });
        return options?.aws?.credentials ? withAwsClientCredentials(options.aws.credentials, execute) : execute();
      },
    );
  }

  /**
   * Retrieves observed AWS Resource Explorer status across enabled regions.
   *
   * @param options - Optional control region, credentials, cancellation signal, and total deadline (default five minutes).
   * @returns The observed discovery status.
   */
  public async getDiscoveryStatus(
    options?: AwsDiscoveryExecutionOptions & { region?: string },
  ): Promise<AwsDiscoveryStatus> {
    emitDebugLog(this.options?.debugLogger, 'sdk: requesting discovery status');

    return this.runDiscoveryOperation(
      options,
      async () => {
        const { getAwsDiscoveryStatus } = await import('./providers/aws/discovery.js');
        throwIfAwsExecutionAborted();
        return this.options?.debugLogger === undefined
          ? getAwsDiscoveryStatus(options?.region)
          : getAwsDiscoveryStatus(options?.region, this.options.debugLogger);
      },
      options?.region,
    );
  }

  /**
   * Bootstraps AWS Resource Explorer in the selected aggregator region.
   *
   * @param options - Optional aggregator region, credentials, cancellation signal, and total deadline (default five minutes).
   * @returns The initialization result.
   */
  public async initializeDiscovery(
    options?: AwsDiscoveryExecutionOptions & { region?: string },
  ): Promise<AwsDiscoveryInitialization> {
    emitDebugLog(this.options?.debugLogger, 'sdk: initializing discovery');

    return this.runDiscoveryOperation(
      options,
      async () => {
        const { initializeAwsDiscovery } = await import('./providers/aws/discovery.js');
        throwIfAwsExecutionAborted();
        return this.options?.debugLogger === undefined
          ? initializeAwsDiscovery(options?.region)
          : initializeAwsDiscovery(options?.region, this.options.debugLogger);
      },
      options?.region,
    );
  }

  /**
   * Lists the AWS resource types supported by Resource Explorer.
   *
   * @param options - Optional credentials, cancellation signal, and total deadline (default five minutes).
   * @returns Supported AWS resource types.
   */
  public async listSupportedDiscoveryResourceTypes(
    options?: AwsDiscoveryExecutionOptions,
  ): Promise<AwsSupportedResourceType[]> {
    emitDebugLog(this.options?.debugLogger, 'sdk: listing supported Resource Explorer resource types');
    return this.runDiscoveryOperation(options, async () => {
      const { listSupportedAwsResourceTypes } = await import('./providers/aws/discovery.js');
      throwIfAwsExecutionAborted();
      return listSupportedAwsResourceTypes();
    });
  }

  /**
   * Loads CloudBurn configuration from disk.
   *
   * @param path - Optional explicit config path to load.
   * @returns The resolved CloudBurn configuration.
   */
  public async loadConfig(path?: string): Promise<CloudBurnConfig> {
    return loadConfig(path);
  }
}
