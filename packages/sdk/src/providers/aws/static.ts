import { dirname } from 'node:path';
import type {
  IaCResource,
  IaCSuppression,
  Rule,
  StaticDatasetKey,
  StaticDatasetMap,
  StaticEvaluationContext,
} from '@cloudburn/rules';
import { StaticResourceBag } from '@cloudburn/rules';
import { type IaCSourceKind, parseIaCWithDiagnostics } from '../../parsers/index.js';
import type { ScanDiagnostic } from '../../types.js';
import { getAwsStaticDatasetDefinition, toStaticResourceId } from './static-registry.js';

/** Static evaluation context with non-fatal diagnostics produced during dataset loading. */
export type AwsStaticResourceLoadResult = StaticEvaluationContext & {
  diagnostics: ScanDiagnostic[];
  suppressionTargets: AwsStaticSuppressionTarget[];
  evaluationScopes?: StaticEvaluationContext[];
};

/** Canonical static resource identity and its parsed inline directives. */
export type AwsStaticSuppressionTarget = {
  path: string;
  resourceId: string;
  suppressions: IaCSuppression[];
};

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
 * @returns Static evaluation context plus non-fatal parser diagnostics.
 */
export const loadAwsStaticResources = async (path: string, rules: Rule[]): Promise<AwsStaticResourceLoadResult> => {
  const datasetKeys = collectStaticDependencies(rules);

  if (datasetKeys.length === 0) {
    return {
      diagnostics: [],
      resources: new StaticResourceBag(),
      suppressionTargets: [],
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
  const { diagnostics, resources: iacResources } = await parseIaCWithDiagnostics(path, { sourceKinds });
  const suppressionTargets = iacResources.flatMap((resource): AwsStaticSuppressionTarget[] => {
    if (!resource.location || !resource.suppressions || resource.suppressions.length === 0) {
      return [];
    }

    return [
      {
        path: resource.location.path,
        resourceId: toStaticResourceId(resource),
        suppressions: resource.suppressions,
      },
    ];
  });
  // Terraform files share references only within their module directory;
  // CloudFormation logical IDs belong to one template, even in a shared folder.
  const resourcesByScope = new Map<string, IaCResource[]>();
  for (const resource of iacResources) {
    const sourcePath = resource.location?.path;
    const scope = sourcePath
      ? resource.type.startsWith('AWS::')
        ? `cloudformation:${sourcePath}`
        : `terraform:${dirname(sourcePath)}`
      : '';
    const scopedResources = resourcesByScope.get(scope) ?? [];
    scopedResources.push(resource);
    resourcesByScope.set(scope, scopedResources);
  }
  const evaluationScopes = [...resourcesByScope.values()].map((scopeResources) => ({
    resources: new StaticResourceBag(
      Object.fromEntries(
        datasetDefinitions.map((definition) => [
          definition.datasetKey,
          definition.load(scopeResources.filter((resource) => definition.resourceTypes.includes(resource.type))),
        ]),
      ),
    ),
  }));
  const loadedDatasets = Object.fromEntries(
    datasetKeys.map((key) => [key, evaluationScopes.flatMap<unknown>((scope) => scope.resources.get(key))]),
  ) as Partial<StaticDatasetMap>;

  return {
    diagnostics,
    resources: new StaticResourceBag(loadedDatasets),
    evaluationScopes,
    suppressionTargets,
  };
};
