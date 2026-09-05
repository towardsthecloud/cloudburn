import { costOptimizationHubIdleCapacityRule } from './idle-capacity.js';
import { costOptimizationHubReservationsRecommendedRule } from './reservations-recommended.js';
import { costOptimizationHubRightsizingRecommendedRule } from './rightsizing-recommended.js';
import { costOptimizationHubSavingsPlansRecommendedRule } from './savings-plans-recommended.js';
import { costOptimizationHubUpgradesRecommendedRule } from './upgrades-recommended.js';

/** Aggregate AWS Cost Optimization Hub rule definitions. */
export const costOptimizationHubRules = [
  costOptimizationHubSavingsPlansRecommendedRule,
  costOptimizationHubReservationsRecommendedRule,
  costOptimizationHubRightsizingRecommendedRule,
  costOptimizationHubIdleCapacityRule,
  costOptimizationHubUpgradesRecommendedRule,
];
