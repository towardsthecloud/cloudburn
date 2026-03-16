import { ebsAttachedToStoppedInstancesRule } from './attached-to-stopped-instances.js';
import { ebsUnattachedVolumeRule } from './unattached-volume.js';
import { ebsVolumeTypeCurrentGenRule } from './volume-type-current-gen.js';

// Intent: aggregate AWS EBS rule definitions.
// TODO(cloudburn): add overprovisioned IOPS checks.
export const ebsRules = [ebsVolumeTypeCurrentGenRule, ebsUnattachedVolumeRule, ebsAttachedToStoppedInstancesRule];
