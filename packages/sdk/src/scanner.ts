import { loadConfig } from './config/loader.js';
import { mergeConfig } from './config/merge.js';
import { emitDebugLog } from './debug.js';
import { runLiveScan } from './engine/run-live.js';
import { runStaticScan } from './engine/run-static.js';
import { evaluateScanPolicy } from './policy.js';
import { type AwsClientCredentials, withAwsClientCredentials } from './providers/aws/client.js';
import {
  getAwsDiscoveryStatus,
  initializeAwsDiscovery,
  listSupportedAwsResourceTypes,
} from './providers/aws/discovery.js';
import type {
  AwsDiscoveryInitialization,
  AwsDiscoveryProgressEvent,
  AwsDiscoveryStatus,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
  CloudBurnConfig,
  ScanResult,
  UnusedResourcesScanResult,
} from './types.js';
import { awsUnusedResourceRules, buildUnusedResourcesScanResult } from './unused-resources.js';

/**
 * High-level SDK facade for CloudBurn scans and config loading.
 */
export class CloudBurnClient {
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
   *   provider chain.
   * @returns Grouped live scan findings.
   */
  public async discover(options?: {
    target?: AwsDiscoveryTarget;
    config?: Partial<CloudBurnConfig>;
    configPath?: string;
    aws?: { credentials?: AwsClientCredentials };
    includeEvaluationResources?: boolean;
    onProgress?: (event: AwsDiscoveryProgressEvent) => void;
  }): Promise<ScanResult> {
    emitDebugLog(this.options?.debugLogger, 'sdk: starting live discovery scan');
    const effectiveConfig = await this.getEffectiveConfig(options?.config, options?.configPath);

    const run = async () => {
      const result = await runLiveScan(effectiveConfig, options?.target ?? { mode: 'current' }, {
        debugLogger: this.options?.debugLogger,
        includeEvaluationResources: options?.includeEvaluationResources,
        onProgress: options?.onProgress,
      });
      const threshold = effectiveConfig.discovery.failOn;

      return threshold === undefined ? result : { ...result, policy: evaluateScanPolicy(result, threshold) };
    };

    return options?.aws?.credentials ? withAwsClientCredentials(options.aws.credentials, run) : run();
  }

  /**
   * Runs the SDK-owned AWS unused-resources profile and returns findings plus
   * complete passed/not-applicable check evidence ready for persistence or UI rendering.
   *
   * @param options - Optional discovery target, progress callback,
   *   and AWS credentials to use instead of the ambient credential provider chain.
   * @returns A self-contained unused-resources scan result.
   */
  public async discoverUnusedResources(options?: {
    target?: AwsDiscoveryTarget;
    aws?: { credentials?: AwsClientCredentials };
    onProgress?: (event: AwsDiscoveryProgressEvent) => void;
  }): Promise<UnusedResourcesScanResult> {
    emitDebugLog(this.options?.debugLogger, 'sdk: starting unused-resources discovery scan');
    const config: CloudBurnConfig = {
      discovery: { enabledRules: awsUnusedResourceRules.map((rule) => rule.id) },
      iac: {},
    };

    const run = async () =>
      buildUnusedResourcesScanResult(
        await runLiveScan(config, options?.target ?? { mode: 'current' }, {
          debugLogger: this.options?.debugLogger,
          includeEvaluationResources: true,
          onProgress: options?.onProgress,
        }),
      );

    return options?.aws?.credentials ? withAwsClientCredentials(options.aws.credentials, run) : run();
  }

  /**
   * Retrieves observed AWS Resource Explorer status across enabled regions.
   *
   * @param options - Optional explicit region to use as the preferred control region.
   * @returns The observed discovery status.
   */
  public async getDiscoveryStatus(options?: { region?: string }): Promise<AwsDiscoveryStatus> {
    emitDebugLog(this.options?.debugLogger, 'sdk: requesting discovery status');

    return this.options?.debugLogger === undefined
      ? getAwsDiscoveryStatus(options?.region)
      : getAwsDiscoveryStatus(options?.region, this.options.debugLogger);
  }

  /**
   * Bootstraps AWS Resource Explorer in the selected aggregator region.
   *
   * @param options - Optional explicit region to use as the aggregator region.
   * @returns The initialization result.
   */
  public async initializeDiscovery(options?: { region?: string }): Promise<AwsDiscoveryInitialization> {
    emitDebugLog(this.options?.debugLogger, 'sdk: initializing discovery');

    return this.options?.debugLogger === undefined
      ? initializeAwsDiscovery(options?.region)
      : initializeAwsDiscovery(options?.region, this.options.debugLogger);
  }

  /**
   * Lists the AWS resource types supported by Resource Explorer.
   *
   * @returns Supported AWS resource types.
   */
  public async listSupportedDiscoveryResourceTypes(): Promise<AwsSupportedResourceType[]> {
    emitDebugLog(this.options?.debugLogger, 'sdk: listing supported Resource Explorer resource types');
    return listSupportedAwsResourceTypes();
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
