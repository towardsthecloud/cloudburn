import { sagemakerIdleEndpointRule } from './idle-endpoint.js';
import { sagemakerRunningNotebookInstanceRule } from './running-notebook-instance.js';
import { sagemakerSavingsPlansCoverageRule } from './savings-plans-coverage.js';

/** Aggregate AWS SageMaker rule definitions. */
export const sagemakerRules = [
  sagemakerRunningNotebookInstanceRule,
  sagemakerIdleEndpointRule,
  sagemakerSavingsPlansCoverageRule,
];
