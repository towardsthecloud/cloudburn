import { sagemakerIdleEndpointRule } from './idle-endpoint.js';
import { sagemakerRunningNotebookInstanceRule } from './running-notebook-instance.js';

/** Aggregate AWS SageMaker rule definitions. */
export const sagemakerRules = [sagemakerRunningNotebookInstanceRule, sagemakerIdleEndpointRule];
