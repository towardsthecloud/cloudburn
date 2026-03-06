import { rdsInstanceClassAllowedProfileRule } from './instance-class-allowed-profile.js';

// Intent: aggregate AWS RDS rule definitions.
// TODO(cloudburn): add idle-instance and single-AZ production checks.
export const rdsRules = [rdsInstanceClassAllowedProfileRule];
