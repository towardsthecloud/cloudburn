import type { CloudProvider, Finding, FindingMatch, Rule, ScanSource, SourceLocation } from '@cloudburn/rules';

// Intent: define SDK-facing contracts for scanner orchestration.
// TODO(cloudburn): extend config and result metadata as new providers/resources land.

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

/** Rule finding groups organized under a cloud provider in scan output. */
export type ProviderFindingGroup = {
  provider: CloudProvider;
  rules: Finding[];
};

/** Result of a scan execution containing provider-grouped lean rule findings. */
export type ScanResult = {
  providers: ProviderFindingGroup[];
};

export type RegisteredRules = {
  activeRules: Rule[];
};

export type { CloudProvider, Finding, FindingMatch, Rule, ScanSource, SourceLocation };
