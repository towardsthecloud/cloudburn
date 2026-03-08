import type { SourceLocation } from '@cloudburn/rules';

/**
 * Normalized IaC resource shape shared across Terraform and CloudFormation
 * parsers.
 */
export type IaCResource = {
  provider: string;
  service: string;
  type: string;
  name: string;
  location?: SourceLocation;
  attributeLocations?: Record<string, SourceLocation>;
  attributes: Record<string, unknown>;
};
