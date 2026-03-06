import { ebsVolumeTypeCurrentGenRule } from './volume-type-current-gen.js';

// Intent: aggregate AWS EBS rule definitions.
// TODO(cloudburn): add unused volume and overprovisioned IOPS checks.
export const ebsRules = [ebsVolumeTypeCurrentGenRule];
