// Intent: normalize IaC resource shape across Terraform and CloudFormation.
// TODO(cloudburn): add source location metadata and richer attribute typing.
export type IaCResource = {
  provider: string;
  service: string;
  type: string;
  name: string;
  attributes: Record<string, unknown>;
};
