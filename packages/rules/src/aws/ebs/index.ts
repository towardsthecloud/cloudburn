import { ebsGp2ToGp3Rule } from './gp2-to-gp3.js';

// Intent: aggregate AWS EBS rule definitions.
// TODO(cloudburn): add unused volume and overprovisioned IOPS checks.
export const ebsRules = [ebsGp2ToGp3Rule];
