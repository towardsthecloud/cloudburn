import { ebsAttachedToStoppedInstancesRule } from './attached-to-stopped-instances.js';
import { ebsHighIopsVolumeRule } from './high-iops-volume.js';
import { ebsLargeVolumeRule } from './large-volume.js';
import { ebsLowIopsVolumeRule } from './low-iops-volume.js';
import { ebsSnapshotMaxAgeRule } from './snapshot-max-age.js';
import { ebsUnattachedVolumeRule } from './unattached-volume.js';
import { ebsVolumeTypeCurrentGenRule } from './volume-type-current-gen.js';

// Intent: aggregate AWS EBS rule definitions.
export const ebsRules = [
  ebsVolumeTypeCurrentGenRule,
  ebsUnattachedVolumeRule,
  ebsAttachedToStoppedInstancesRule,
  ebsLargeVolumeRule,
  ebsHighIopsVolumeRule,
  ebsLowIopsVolumeRule,
  ebsSnapshotMaxAgeRule,
];
