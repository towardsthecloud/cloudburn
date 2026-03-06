// Intent: define rule metadata contracts shared across provider rule packs.
// TODO(cloudburn): extend finding shape with remediation and confidence score.

/** Indicates how a rule discovers resources: live AWS API calls or IaC file parsing. */
export type ScanSource = 'discovery' | 'iac';

/** Structured location of a cloud resource identified by a finding. */
export type ResourceLocation = {
  provider: 'aws' | 'azure' | 'gcp';
  accountId: string;
  region: string;
  service: string;
  resourceId: string;
};

export type AwsEbsVolume = {
  volumeId: string;
  volumeType: string;
  region: string;
};

export type LiveEvaluationContext = {
  ebsVolumes: AwsEbsVolume[];
};

export type StaticEvaluationContext = Record<string, never>;

/** A single policy violation emitted by a rule evaluation. */
export type Finding = {
  id: string;
  ruleId: string;
  message: string;
  resource: ResourceLocation;
  source: ScanSource;
};

/** A declarative cost-optimization rule with optional live and static evaluators. */
export type Rule = {
  id: string;
  name: string;
  description: string;
  provider: 'aws' | 'azure' | 'gcp';
  service: string;
  supports: ScanSource[];
  evaluateLive?: (context: LiveEvaluationContext) => Finding[];
  evaluateStatic?: (context: StaticEvaluationContext) => Finding[];
};
