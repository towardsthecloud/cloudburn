import { route53HealthCheckUnusedRule } from './health-check-unused.js';
import { route53RecordHigherTtlRule } from './record-higher-ttl.js';

// Intent: aggregate AWS Route 53 rule definitions.
export const route53Rules = [route53RecordHigherTtlRule, route53HealthCheckUnusedRule];
