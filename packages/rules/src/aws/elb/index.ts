import { elbAlbWithoutTargetsRule } from './alb-without-targets.js';
import { elbClassicWithoutInstancesRule } from './classic-without-instances.js';
import { elbGatewayWithoutTargetsRule } from './gateway-without-targets.js';

/** Aggregate AWS ELB rule definitions. */
export const elbRules = [elbAlbWithoutTargetsRule, elbClassicWithoutInstancesRule, elbGatewayWithoutTargetsRule];
