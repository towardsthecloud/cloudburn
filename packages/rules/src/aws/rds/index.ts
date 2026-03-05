import { rdsAllowedInstanceClassesRule } from './allowed-instance-classes.js';

// Intent: aggregate AWS RDS rule definitions.
// TODO(cloudburn): add idle-instance and single-AZ production checks.
export const rdsRules = [rdsAllowedInstanceClassesRule];
