import { loadConfig } from './config/loader.js';
import { runLiveScan } from './engine/run-live.js';
import { runStaticScan } from './engine/run-static.js';
import type { CloudBurnConfig, ScanResult } from './types.js';

// Intent: provide a single SDK facade used by CLI and external integrations.
// TODO(cloudburn): add custom rule paths and advanced scan options.
export class CloudBurnScanner {
  public async scanStatic(path: string, config?: Partial<CloudBurnConfig>): Promise<ScanResult> {
    const effectiveConfig = config ? { ...(await this.loadConfig()), ...config } : await this.loadConfig();

    return runStaticScan(path, effectiveConfig);
  }

  public async scanLive(config?: Partial<CloudBurnConfig>): Promise<ScanResult> {
    const effectiveConfig = config ? { ...(await this.loadConfig()), ...config } : await this.loadConfig();

    return runLiveScan(effectiveConfig);
  }

  public async loadConfig(path?: string): Promise<CloudBurnConfig> {
    return loadConfig(path);
  }
}
