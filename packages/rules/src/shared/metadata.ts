// Intent: define rule metadata contracts shared across provider rule packs.
// TODO(cloudburn): extend finding shape with remediation and confidence score.

/** Indicates how a rule discovers resources: live AWS API calls or IaC file parsing. */
export type ScanSource = 'discovery' | 'iac';

/** Supported cloud providers for built-in and custom rules. */
export type CloudProvider = 'aws' | 'azure' | 'gcp';

/** Source coordinates for an IaC declaration that produced a finding. */
export type SourceLocation = {
  path: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
};

export type AwsEbsVolume = {
  volumeId: string;
  volumeType: string;
  region: string;
};

/**
 * Normalized IaC resource shape shared across Terraform and CloudFormation
 * parsers.
 */
export type IaCResource = {
  provider: CloudProvider;
  type: string;
  name: string;
  location?: SourceLocation;
  attributeLocations?: Record<string, SourceLocation>;
  attributes: Record<string, unknown>;
};

export type LiveEvaluationContext = {
  ebsVolumes: AwsEbsVolume[];
};

/** Provider-normalized Terraform resources available to static rule evaluators. */
export type StaticEvaluationContext = {
  terraformResources: IaCResource[];
};

/** A resource-level policy match emitted inside a rule finding group. */
export type FindingMatch = {
  resourceId: string;
  accountId?: string;
  region?: string;
  location?: SourceLocation;
};

/** A rule-level finding group containing all matched resources for that rule. */
export type Finding = {
  ruleId: string;
  service: string;
  source: ScanSource;
  message: string;
  findings: FindingMatch[];
};

/** A declarative cost-optimization rule with optional live and static evaluators. */
export type Rule = {
  id: string;
  name: string;
  description: string;
  message: string;
  provider: CloudProvider;
  service: string;
  supports: ScanSource[];
  evaluateLive?: (context: LiveEvaluationContext) => Finding | null;
  evaluateStatic?: (context: StaticEvaluationContext) => Finding | null;
};
