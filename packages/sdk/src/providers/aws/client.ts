// Intent: centralize AWS client creation and credential strategy.
// TODO(cloudburn): wire AWS SDK v3 clients with profile/role support.
export type AwsClientConfig = {
  region?: string;
  profile?: string;
};

export const createAwsClient = (config: AwsClientConfig): AwsClientConfig => config;
