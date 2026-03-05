// Intent: define rule metadata contracts shared across provider rule packs.
// TODO(cloudburn): extend finding shape with remediation and confidence score.
export type Severity = 'error' | 'warning' | 'info';

export type ScanMode = 'static' | 'live';

export type Finding = {
  id: string;
  ruleId: string;
  severity: Severity;
  message: string;
  location: string;
  mode: ScanMode;
};

export type Rule = {
  id: string;
  name: string;
  description: string;
  provider: 'aws' | 'azure' | 'gcp';
  service: string;
  severity: Severity;
  supports: ScanMode[];
};
