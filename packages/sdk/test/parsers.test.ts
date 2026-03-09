import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCloudFormation, parseIaC, parseTerraform } from '../src/parsers/index.js';

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

  it('auto-detects terraform resources from a .tf file', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/ebs-gp2.tf', import.meta.url));
    const resources = await parseIaC(resourcePath);

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

  it('returns no autodetected resources for unsupported file extensions', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir/notes.txt', import.meta.url));
    const resources = await parseIaC(resourcePath);

    expect(resources).toEqual([]);
  });

  it('parses a cloudformation yaml resource and preserves raw intrinsic functions', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/ebs-volume.yaml', import.meta.url));
    const resources = await parseCloudFormation(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'AWS::EC2::Volume',
        name: 'MyVolume',
        location: {
          path: 'ebs-volume.yaml',
          startLine: 3,
          startColumn: 3,
        },
        attributeLocations: {
          Type: {
            path: 'ebs-volume.yaml',
            startLine: 4,
            startColumn: 5,
          },
          Condition: {
            path: 'ebs-volume.yaml',
            startLine: 5,
            startColumn: 5,
          },
          Properties: {
            path: 'ebs-volume.yaml',
            startLine: 6,
            startColumn: 5,
          },
          'Properties.AvailabilityZone': {
            path: 'ebs-volume.yaml',
            startLine: 7,
            startColumn: 7,
          },
          'Properties.Size': {
            path: 'ebs-volume.yaml',
            startLine: 8,
            startColumn: 7,
          },
          'Properties.VolumeType': {
            path: 'ebs-volume.yaml',
            startLine: 9,
            startColumn: 7,
          },
        },
        attributes: {
          Condition: 'CreateVolume',
          Properties: {
            AvailabilityZone: {
              Ref: 'AvailabilityZone',
            },
            Size: 100,
            VolumeType: 'gp2',
          },
        },
      },
    ]);
  });

  it('parses a cloudformation json resource', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/ebs-volume.json', import.meta.url));
    const resources = await parseCloudFormation(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'AWS::EC2::Volume',
        name: 'MyVolume',
        location: {
          path: 'ebs-volume.json',
          startLine: 3,
          startColumn: 5,
        },
        attributeLocations: {
          Type: {
            path: 'ebs-volume.json',
            startLine: 4,
            startColumn: 7,
          },
          Properties: {
            path: 'ebs-volume.json',
            startLine: 5,
            startColumn: 7,
          },
          'Properties.AvailabilityZone': {
            path: 'ebs-volume.json',
            startLine: 6,
            startColumn: 9,
          },
          'Properties.Size': {
            path: 'ebs-volume.json',
            startLine: 7,
            startColumn: 9,
          },
          'Properties.VolumeType': {
            path: 'ebs-volume.json',
            startLine: 8,
            startColumn: 9,
          },
        },
        attributes: {
          Properties: {
            AvailabilityZone: {
              Ref: 'AvailabilityZone',
            },
            Size: 100,
            VolumeType: 'gp2',
          },
        },
      },
    ]);
  });

  it('auto-detects cloudformation resources from a template file', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/ebs-volume.yaml', import.meta.url));
    const resources = await parseIaC(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'AWS::EC2::Volume',
        name: 'MyVolume',
        location: {
          path: 'ebs-volume.yaml',
          startLine: 3,
          startColumn: 3,
        },
        attributeLocations: {
          Type: {
            path: 'ebs-volume.yaml',
            startLine: 4,
            startColumn: 5,
          },
          Condition: {
            path: 'ebs-volume.yaml',
            startLine: 5,
            startColumn: 5,
          },
          Properties: {
            path: 'ebs-volume.yaml',
            startLine: 6,
            startColumn: 5,
          },
          'Properties.AvailabilityZone': {
            path: 'ebs-volume.yaml',
            startLine: 7,
            startColumn: 7,
          },
          'Properties.Size': {
            path: 'ebs-volume.yaml',
            startLine: 8,
            startColumn: 7,
          },
          'Properties.VolumeType': {
            path: 'ebs-volume.yaml',
            startLine: 9,
            startColumn: 7,
          },
        },
        attributes: {
          Condition: 'CreateVolume',
          Properties: {
            AvailabilityZone: {
              Ref: 'AvailabilityZone',
            },
            Size: 100,
            VolumeType: 'gp2',
          },
        },
      },
    ]);
  });

  it('returns no cloudformation resources for yaml files without a Resources section', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/not-template.yaml', import.meta.url));
    const resources = await parseCloudFormation(resourcePath);

    expect(resources).toEqual([]);
  });

  it('preserves additional cloudformation short-form intrinsics as raw canonical objects', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/intrinsics.yaml', import.meta.url));
    const resources = await parseCloudFormation(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'AWS::EC2::Volume',
        name: 'MyVolume',
        location: {
          path: 'intrinsics.yaml',
          startLine: 2,
          startColumn: 3,
        },
        attributeLocations: {
          Type: {
            path: 'intrinsics.yaml',
            startLine: 3,
            startColumn: 5,
          },
          Properties: {
            path: 'intrinsics.yaml',
            startLine: 4,
            startColumn: 5,
          },
          'Properties.AvailabilityZone': {
            path: 'intrinsics.yaml',
            startLine: 5,
            startColumn: 7,
          },
          'Properties.Encrypted': {
            path: 'intrinsics.yaml',
            startLine: 6,
            startColumn: 7,
          },
          'Properties.KmsKeyId': {
            path: 'intrinsics.yaml',
            startLine: 7,
            startColumn: 7,
          },
          'Properties.Tags': {
            path: 'intrinsics.yaml',
            startLine: 8,
            startColumn: 7,
          },
          'Properties.VolumeType': {
            path: 'intrinsics.yaml',
            startLine: 11,
            startColumn: 7,
          },
        },
        attributes: {
          Properties: {
            AvailabilityZone: {
              'Fn::GetAZs': '',
            },
            Encrypted: {
              'Fn::If': ['UseEncryption', true, false],
            },
            KmsKeyId: {
              'Fn::GetAtt': 'VolumeKey.Arn',
            },
            Tags: [
              {
                Key: 'Subnets',
                Value: {
                  'Fn::Cidr': ['10.0.0.0/16', 4, 8],
                },
              },
            ],
            VolumeType: 'gp2',
          },
        },
      },
      {
        provider: 'aws',
        type: 'AWS::CloudFormation::CustomResource',
        name: 'CustomThing',
        location: {
          path: 'intrinsics.yaml',
          startLine: 12,
          startColumn: 3,
        },
        attributeLocations: {
          Type: {
            path: 'intrinsics.yaml',
            startLine: 13,
            startColumn: 5,
          },
          Metadata: {
            path: 'intrinsics.yaml',
            startLine: 14,
            startColumn: 5,
          },
        },
        attributes: {
          Metadata: {
            Macro: {
              'Fn::Transform': {
                Name: 'AWS::Include',
                Parameters: {
                  Location: 's3://bucket/snippet.yaml',
                },
              },
            },
          },
        },
      },
    ]);
  });

  it('returns no cloudformation resources for invalid yaml templates', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/invalid-template.yaml', import.meta.url));
    const resources = await parseCloudFormation(resourcePath);

    expect(resources).toEqual([]);
  });

  it('auto-detects mixed terraform and cloudformation directories in stable order', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/iac-mixed', import.meta.url));
    const resources = await parseIaC(resourcePath);

    expect(resources.map((resource) => `${resource.location?.path}:${resource.type}.${resource.name}`)).toEqual([
      'main.tf:aws_ebs_volume.gp2_logs',
      'template.yaml:AWS::EC2::Volume.MyVolume',
    ]);
  });

  it('keeps terraform resources when a sibling cloudformation template is invalid', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/iac-invalid-cloudformation', import.meta.url));
    const resources = await parseIaC(resourcePath);

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
    ]);
  });
});
