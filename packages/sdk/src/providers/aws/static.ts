import type { Rule, StaticDatasetKey, StaticEvaluationContext } from '@cloudburn/rules';
import { StaticResourceBag } from '@cloudburn/rules';
import { type IaCSourceKind, parseIaC } from '../../parsers/index.js';
import { getAwsStaticDatasetDefinition } from './static-registry.js';

const sortUnique = <T extends string>(values: T[]): T[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const collectStaticDependencies = (rules: Rule[]): StaticDatasetKey[] => {
  const datasetKeys: StaticDatasetKey[] = [];

  for (const rule of rules) {
    if (!rule.supports.includes('iac') || !rule.evaluateStatic) {
      continue;
    }

    if (!rule.staticDependencies || rule.staticDependencies.length === 0) {
      throw new Error(`Static rule ${rule.id} is missing staticDependencies metadata.`);
    }

    for (const datasetKey of rule.staticDependencies) {
      const definition = getAwsStaticDatasetDefinition(datasetKey);

      if (!definition) {
        throw new Error(`Static rule ${rule.id} declares unknown static dependency '${datasetKey}'.`);
      }

      datasetKeys.push(definition.datasetKey);
    }
  }

  return sortUnique(datasetKeys);
};

/**
 * Loads normalized static IaC datasets for active AWS rules.
 *
 * @param path - Terraform file, CloudFormation template, or directory to scan.
 * @param rules - Active rules that declare their static dataset requirements.
 * @returns Static evaluation context backed by `StaticResourceBag`.
 */
export const loadAwsStaticResources = async (path: string, rules: Rule[]): Promise<StaticEvaluationContext> => {
  const datasetKeys = collectStaticDependencies(rules);

  if (datasetKeys.length === 0) {
    return {
      resources: new StaticResourceBag(),
    };
  }

  const datasetDefinitions = datasetKeys.map((datasetKey) => {
    const definition = getAwsStaticDatasetDefinition(datasetKey);

    if (!definition) {
      throw new Error(`Unknown static dataset '${datasetKey}'.`);
    }

    return definition;
  });
  const sourceKinds = sortUnique(datasetDefinitions.flatMap((definition) => definition.sourceKinds) as IaCSourceKind[]);
  const iacResources = await parseIaC(path, { sourceKinds });
  const loadedDatasets = datasetDefinitions.map(
    (definition) =>
      [
        definition.datasetKey,
        definition.load(iacResources.filter((resource) => definition.resourceTypes.includes(resource.type))),
      ] as const,
  );

  return {
    resources: new StaticResourceBag(Object.fromEntries(loadedDatasets)),
  };
};
