import { loadConfig } from './config/loader.js';
import { runLiveScan } from './engine/run-live.js';
import { runStaticScan } from './engine/run-static.js';
import type { CloudBurnConfig, ScanResult } from './types.js';

/**
 * High-level SDK facade for CloudBurn scans and config loading.
 */
export class CloudBurnScanner {
  /**
   * Runs a static IaC scan against a file or directory.
   *
   * Terraform and CloudFormation inputs are auto-detected by the parser layer,
   * so callers only need to provide the path to the file or directory to scan.
   *
   * @param path - Terraform file, CloudFormation template, or directory to scan.
   * @param config - Optional config overrides merged onto the loaded config.
   * @returns Grouped static scan findings.
   */
  public async scanStatic(path: string, config?: Partial<CloudBurnConfig>): Promise<ScanResult> {
    const effectiveConfig = config ? { ...(await this.loadConfig()), ...config } : await this.loadConfig();

    return runStaticScan(path, effectiveConfig);
  }

  /**
   * Runs a live AWS scan with the effective CloudBurn configuration.
   *
   * @param config - Optional config overrides merged onto the loaded config.
   * @returns Grouped live scan findings.
   */
  public async scanLive(config?: Partial<CloudBurnConfig>): Promise<ScanResult> {
    const effectiveConfig = config ? { ...(await this.loadConfig()), ...config } : await this.loadConfig();

    return runLiveScan(effectiveConfig);
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
