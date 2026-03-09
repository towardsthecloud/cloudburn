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
        type: 'aws_ebs_volume',
        name: 'gp2_data',
        location: {
          path: 'ebs-gp2.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'ebs-gp2.tf',
            startLine: 2,
            startColumn: 3,
          },
          size: {
            path: 'ebs-gp2.tf',
            startLine: 3,
            startColumn: 3,
          },
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
        type: 'aws_ebs_volume',
        name: 'nested_type',
        location: {
          path: 'ebs-nested-type.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          tags: {
            path: 'ebs-nested-type.tf',
            startLine: 2,
            startColumn: 3,
          },
          availability_zone: {
            path: 'ebs-nested-type.tf',
            startLine: 6,
            startColumn: 3,
          },
          size: {
            path: 'ebs-nested-type.tf',
            startLine: 7,
            startColumn: 3,
          },
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

  it('parses terraform directories recursively and preserves unresolved expressions', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'aws_ebs_volume',
        name: 'gp2_logs',
        location: {
          path: 'main.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'main.tf',
            startLine: 2,
            startColumn: 3,
          },
          size: {
            path: 'main.tf',
            startLine: 3,
            startColumn: 3,
          },
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
        type: 'aws_ebs_volume',
        name: 'gp3_data',
        location: {
          path: 'main.tf',
          startLine: 7,
          startColumn: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'main.tf',
            startLine: 8,
            startColumn: 3,
          },
          size: {
            path: 'main.tf',
            startLine: 9,
            startColumn: 3,
          },
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
        type: 'aws_ebs_volume',
        name: 'var_backed',
        location: {
          path: 'variables.tf',
          startLine: 6,
          startColumn: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'variables.tf',
            startLine: 7,
            startColumn: 3,
          },
          size: {
            path: 'variables.tf',
            startLine: 8,
            startColumn: 3,
          },
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
      {
        provider: 'aws',
        type: 'aws_instance',
        name: 'web',
        location: {
          path: 'variables.tf',
          startLine: 12,
          startColumn: 1,
        },
        attributeLocations: {
          ami: {
            path: 'variables.tf',
            startLine: 13,
            startColumn: 3,
          },
          instance_type: {
            path: 'variables.tf',
            startLine: 14,
            startColumn: 3,
          },
        },
        attributes: {
          ami: 'ami-1234567890abcdef0',
          instance_type: 't3.micro',
        },
      },
    ]);
  });

  it('parses arbitrary aws resource types and ignores non-aws resources in the same file', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/aws-mixed.tf', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'aws_instance',
        name: 'web',
        location: {
          path: 'aws-mixed.tf',
          startLine: 1,
          startColumn: 1,
        },
        attributeLocations: {
          ami: {
            path: 'aws-mixed.tf',
            startLine: 2,
            startColumn: 3,
          },
          instance_type: {
            path: 'aws-mixed.tf',
            startLine: 3,
            startColumn: 3,
          },
          tags: {
            path: 'aws-mixed.tf',
            startLine: 4,
            startColumn: 3,
          },
        },
        attributes: {
          ami: 'ami-1234567890abcdef0',
          instance_type: 't3.micro',
          tags: {
            instance_type: 'not-the-top-level-field',
          },
        },
      },
      {
        provider: 'aws',
        type: 'aws_s3_bucket',
        name: 'logs',
        location: {
          path: 'aws-mixed.tf',
          startLine: 9,
          startColumn: 1,
        },
        attributeLocations: {
          bucket: {
            path: 'aws-mixed.tf',
            startLine: 10,
            startColumn: 3,
          },
        },
        attributes: {
          bucket: 'cloudburn-access-logs',
        },
      },
    ]);
  });

  it('returns no terraform resources for unsupported file extensions', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir/notes.txt', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([]);
  });

  it('returns no terraform resources when files contain only non-aws resources', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));
    const resources = await parseTerraform(resourcePath);

    expect(resources).toEqual([]);
  });

  it('returns empty cloudformation resources in scaffold mode', async () => {
    const resources = await parseCloudFormation('fixtures/template.yaml');

    expect(resources).toEqual([]);
  });
});
