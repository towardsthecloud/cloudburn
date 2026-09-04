import { sagemakerIdleEndpointRule } from './idle-endpoint.js';
import { sagemakerRunningNotebookInstanceRule } from './running-notebook-instance.js';
import { sagemakerSavingsPlansRecommendedRule } from './savings-plans-recommended.js';

/** Aggregate AWS SageMaker rule definitions. */
export const sagemakerRules = [
  sagemakerRunningNotebookInstanceRule,
  sagemakerIdleEndpointRule,
  sagemakerSavingsPlansRecommendedRule,
];
