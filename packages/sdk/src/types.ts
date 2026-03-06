import type { Finding, Rule, ScanSource } from '@cloudburn/rules';

// Intent: define SDK-facing contracts for scanner orchestration.
// TODO(cloudburn): align these interfaces with final CLI output and config schema.

export type RuleConfig = Record<string, unknown>;

export type CloudBurnConfig = {
  version: number;
  profile: string;
  profiles: Record<string, Record<string, RuleConfig>>;
  rules: Record<string, RuleConfig>;
  customRules: string[];
  live: {
    tags: Record<string, string>;
    regions: string[];
  };
};

/** Result of a scan execution containing the source mode and all findings. */
export type ScanResult = {
  source: ScanSource;
  findings: Finding[];
};

export type RegisteredRules = {
  activeRules: Rule[];
};

export type { Finding, Rule, ScanSource };
