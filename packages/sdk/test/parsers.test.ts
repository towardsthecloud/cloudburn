import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCloudFormation, parseTerraform } from '../src/parsers/index.js';

describe('parsers', () => {
  it('parses a literal aws_ebs_volume terraform resource', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/ebs-gp2.tf', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        service: 'ebs',
        type: 'aws_ebs_volume',
        name: 'gp2_data',
        location: {
          path: 'ebs-gp2.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          type: {
            path: 'ebs-gp2.tf',
            startLine: 4,
            startColumn: 3,
          },
        },
        attributes: {
          availability_zone: 'eu-west-1a',
          size: 100,
          type: 'gp2',
        },
      },
    ]);
  });

  it('captures the top-level type attribute location when nested maps also define type keys', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/ebs-nested-type.tf', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        service: 'ebs',
        type: 'aws_ebs_volume',
        name: 'nested_type',
        location: {
          path: 'ebs-nested-type.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          type: {
            path: 'ebs-nested-type.tf',
            startLine: 8,
            startColumn: 3,
          },
        },
        attributes: {
          availability_zone: 'eu-west-1a',
          size: 100,
          tags: {
            type: 'important',
          },
          type: 'gp2',
        },
      },
    ]);
  });

  it('parses terraform directories recursively and ignores non-literal or skipped files', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        service: 'ebs',
        type: 'aws_ebs_volume',
        name: 'gp2_logs',
        location: {
          path: 'main.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          type: {
            path: 'main.tf',
            startLine: 4,
            startColumn: 3,
          },
        },
        attributes: {
          availability_zone: 'eu-west-1a',
          size: 50,
          type: 'gp2',
        },
      },
      {
        provider: 'aws',
        service: 'ebs',
        type: 'aws_ebs_volume',
        name: 'gp3_data',
        location: {
          path: 'main.tf',
          startLine: 7,
          startColumn: 1,
        },
        attributeLocations: {
          type: {
            path: 'main.tf',
            startLine: 10,
            startColumn: 3,
          },
        },
        attributes: {
          availability_zone: 'eu-west-1a',
          size: 200,
          type: 'gp3',
        },
      },
      {
        provider: 'aws',
        service: 'ebs',
        type: 'aws_ebs_volume',
        name: 'var_backed',
        location: {
          path: 'variables.tf',
          startLine: 6,
          startColumn: 1,
        },
        attributeLocations: {
          type: {
            path: 'variables.tf',
            startLine: 9,
            startColumn: 3,
          },
        },
        attributes: {
          availability_zone: 'eu-west-1a',
          size: 25,
          type: '${' + 'var.volume_type}',
        },
      },
    ]);
  });

  it('returns no terraform resources for unsupported file extensions', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir/notes.txt', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([]);
  });

  it('returns no terraform resources when supported resources are absent', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([]);
  });

  it('returns empty cloudformation resources in scaffold mode', async () => {
    const resources = await parseCloudFormation('fixtures/template.yaml');

    expect(resources).toEqual([]);
  });
});
