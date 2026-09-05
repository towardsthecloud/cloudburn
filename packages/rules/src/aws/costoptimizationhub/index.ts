import { costOptimizationHubGravitonRecommendedRule } from './graviton-recommended.js';
import { costOptimizationHubIdleCapacityRule } from './idle-capacity.js';
import { costOptimizationHubReservationsRecommendedRule } from './reservations-recommended.js';
import { costOptimizationHubSavingsPlansRecommendedRule } from './savings-plans-recommended.js';

/** Aggregate AWS Cost Optimization Hub rule definitions. */
export const costOptimizationHubRules = [
  costOptimizationHubSavingsPlansRecommendedRule,
  costOptimizationHubReservationsRecommendedRule,
  costOptimizationHubIdleCapacityRule,
  costOptimizationHubGravitonRecommendedRule,
];
