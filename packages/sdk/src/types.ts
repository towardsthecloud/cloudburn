import type { Finding, Rule } from '@cloudburn/rules';

// Intent: define SDK-facing contracts for scanner orchestration.
// TODO(cloudburn): align these interfaces with final CLI output and config schema.
export type ScanMode = 'static' | 'live';

export type Severity = 'error' | 'warning' | 'info';

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

export type ScanResult = {
  mode: ScanMode;
  findings: Finding[];
};

export type RegisteredRules = {
  activeRules: Rule[];
};

export type { Finding, Rule };
