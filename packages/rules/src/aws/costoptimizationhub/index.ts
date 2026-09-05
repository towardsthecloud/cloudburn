import { costOptimizationHubIdleCapacityRule } from './idle-capacity.js';
import { costOptimizationHubReservationsRecommendedRule } from './reservations-recommended.js';
import { costOptimizationHubSavingsPlansRecommendedRule } from './savings-plans-recommended.js';
import { costOptimizationHubUpgradesRecommendedRule } from './upgrades-recommended.js';

/** Aggregate AWS Cost Optimization Hub rule definitions. */
export const costOptimizationHubRules = [
  costOptimizationHubSavingsPlansRecommendedRule,
  costOptimizationHubReservationsRecommendedRule,
  costOptimizationHubIdleCapacityRule,
  costOptimizationHubUpgradesRecommendedRule,
];
