import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
          line: 1,
          column: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'ebs-gp2.tf',
            line: 2,
            column: 3,
          },
          size: {
            path: 'ebs-gp2.tf',
            line: 3,
            column: 3,
          },
          type: {
            path: 'ebs-gp2.tf',
            line: 4,
            column: 3,
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
          line: 1,
          column: 1,
        },
        attributeLocations: {
          tags: {
            path: 'ebs-nested-type.tf',
            line: 2,
            column: 3,
          },
          availability_zone: {
            path: 'ebs-nested-type.tf',
            line: 6,
            column: 3,
          },
          size: {
            path: 'ebs-nested-type.tf',
            line: 7,
            column: 3,
          },
          type: {
            path: 'ebs-nested-type.tf',
            line: 8,
            column: 3,
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
          line: 1,
          column: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'main.tf',
            line: 2,
            column: 3,
          },
          size: {
            path: 'main.tf',
            line: 3,
            column: 3,
          },
          type: {
            path: 'main.tf',
            line: 4,
            column: 3,
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
          line: 7,
          column: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'main.tf',
            line: 8,
            column: 3,
          },
          size: {
            path: 'main.tf',
            line: 9,
            column: 3,
          },
          type: {
            path: 'main.tf',
            line: 10,
            column: 3,
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
          line: 6,
          column: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'variables.tf',
            line: 7,
            column: 3,
          },
          size: {
            path: 'variables.tf',
            line: 8,
            column: 3,
          },
          type: {
            path: 'variables.tf',
            line: 9,
            column: 3,
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
          line: 12,
          column: 1,
        },
        attributeLocations: {
          ami: {
            path: 'variables.tf',
            line: 13,
            column: 3,
          },
          instance_type: {
            path: 'variables.tf',
            line: 14,
            column: 3,
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
          line: 1,
          column: 1,
        },
        attributeLocations: {
          ami: {
            path: 'aws-mixed.tf',
            line: 2,
            column: 3,
          },
          instance_type: {
            path: 'aws-mixed.tf',
            line: 3,
            column: 3,
          },
          tags: {
            path: 'aws-mixed.tf',
            line: 4,
            column: 3,
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
          line: 9,
          column: 1,
        },
        attributeLocations: {
          bucket: {
            path: 'aws-mixed.tf',
            line: 10,
            column: 3,
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
          line: 1,
          column: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'ebs-gp2.tf',
            line: 2,
            column: 3,
          },
          size: {
            path: 'ebs-gp2.tf',
            line: 3,
            column: 3,
          },
          type: {
            path: 'ebs-gp2.tf',
            line: 4,
            column: 3,
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
          line: 3,
          column: 3,
        },
        attributeLocations: {
          Type: {
            path: 'ebs-volume.yaml',
            line: 4,
            column: 5,
          },
          Condition: {
            path: 'ebs-volume.yaml',
            line: 5,
            column: 5,
          },
          Properties: {
            path: 'ebs-volume.yaml',
            line: 6,
            column: 5,
          },
          'Properties.AvailabilityZone': {
            path: 'ebs-volume.yaml',
            line: 7,
            column: 7,
          },
          'Properties.Size': {
            path: 'ebs-volume.yaml',
            line: 8,
            column: 7,
          },
          'Properties.VolumeType': {
            path: 'ebs-volume.yaml',
            line: 9,
            column: 7,
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

  it('parses a cloudformation EC2 instance resource', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/cloudformation/ec2-instance.yaml', import.meta.url));
    const resources = await parseCloudFormation(resourcePath);

    expect(resources).toEqual([
      {
        provider: 'aws',
        type: 'AWS::EC2::Instance',
        name: 'LegacyWeb',
        location: {
          path: 'ec2-instance.yaml',
          line: 3,
          column: 3,
        },
        attributeLocations: {
          Type: {
            path: 'ec2-instance.yaml',
            line: 4,
            column: 5,
          },
          Properties: {
            path: 'ec2-instance.yaml',
            line: 5,
            column: 5,
          },
          'Properties.ImageId': {
            path: 'ec2-instance.yaml',
            line: 6,
            column: 7,
          },
          'Properties.InstanceType': {
            path: 'ec2-instance.yaml',
            line: 7,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            ImageId: 'ami-1234567890abcdef0',
            InstanceType: 'm4.large',
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
          line: 3,
          column: 5,
        },
        attributeLocations: {
          Type: {
            path: 'ebs-volume.json',
            line: 4,
            column: 7,
          },
          Properties: {
            path: 'ebs-volume.json',
            line: 5,
            column: 7,
          },
          'Properties.AvailabilityZone': {
            path: 'ebs-volume.json',
            line: 6,
            column: 9,
          },
          'Properties.Size': {
            path: 'ebs-volume.json',
            line: 7,
            column: 9,
          },
          'Properties.VolumeType': {
            path: 'ebs-volume.json',
            line: 8,
            column: 9,
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
          line: 3,
          column: 3,
        },
        attributeLocations: {
          Type: {
            path: 'ebs-volume.yaml',
            line: 4,
            column: 5,
          },
          Condition: {
            path: 'ebs-volume.yaml',
            line: 5,
            column: 5,
          },
          Properties: {
            path: 'ebs-volume.yaml',
            line: 6,
            column: 5,
          },
          'Properties.AvailabilityZone': {
            path: 'ebs-volume.yaml',
            line: 7,
            column: 7,
          },
          'Properties.Size': {
            path: 'ebs-volume.yaml',
            line: 8,
            column: 7,
          },
          'Properties.VolumeType': {
            path: 'ebs-volume.yaml',
            line: 9,
            column: 7,
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
          line: 2,
          column: 3,
        },
        attributeLocations: {
          Type: {
            path: 'intrinsics.yaml',
            line: 3,
            column: 5,
          },
          Properties: {
            path: 'intrinsics.yaml',
            line: 4,
            column: 5,
          },
          'Properties.AvailabilityZone': {
            path: 'intrinsics.yaml',
            line: 5,
            column: 7,
          },
          'Properties.Encrypted': {
            path: 'intrinsics.yaml',
            line: 6,
            column: 7,
          },
          'Properties.KmsKeyId': {
            path: 'intrinsics.yaml',
            line: 7,
            column: 7,
          },
          'Properties.Tags': {
            path: 'intrinsics.yaml',
            line: 8,
            column: 7,
          },
          'Properties.VolumeType': {
            path: 'intrinsics.yaml',
            line: 11,
            column: 7,
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
          line: 12,
          column: 3,
        },
        attributeLocations: {
          Type: {
            path: 'intrinsics.yaml',
            line: 13,
            column: 5,
          },
          Metadata: {
            path: 'intrinsics.yaml',
            line: 14,
            column: 5,
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

  it('parses explicit cloudformation symlink file roots', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/cloudformation/ebs-volume.yaml', import.meta.url));
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cloudburn-cfn-root-symlink-'));

    try {
      const symlinkPath = join(tempDirectory, 'linked-template.yaml');

      await symlink(fixturePath, symlinkPath);

      const resources = await parseCloudFormation(symlinkPath);

      expect(resources).toEqual([
        {
          provider: 'aws',
          type: 'AWS::EC2::Volume',
          name: 'MyVolume',
          location: {
            path: 'linked-template.yaml',
            line: 3,
            column: 3,
          },
          attributeLocations: {
            Type: {
              path: 'linked-template.yaml',
              line: 4,
              column: 5,
            },
            Condition: {
              path: 'linked-template.yaml',
              line: 5,
              column: 5,
            },
            Properties: {
              path: 'linked-template.yaml',
              line: 6,
              column: 5,
            },
            'Properties.AvailabilityZone': {
              path: 'linked-template.yaml',
              line: 7,
              column: 7,
            },
            'Properties.Size': {
              path: 'linked-template.yaml',
              line: 8,
              column: 7,
            },
            'Properties.VolumeType': {
              path: 'linked-template.yaml',
              line: 9,
              column: 7,
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
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it('parses explicit cloudformation symlink directory roots', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'cloudburn-cfn-root-target-'));
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cloudburn-cfn-root-dir-link-'));

    try {
      await writeFile(
        join(targetDirectory, 'template.yaml'),
        ['Resources:', '  Bucket:', '    Type: AWS::S3::Bucket', ''].join('\n'),
      );

      const symlinkPath = join(tempDirectory, 'linked-directory');

      await symlink(targetDirectory, symlinkPath);

      const resources = await parseCloudFormation(symlinkPath);

      expect(resources).toEqual([
        {
          provider: 'aws',
          type: 'AWS::S3::Bucket',
          name: 'Bucket',
          location: {
            path: 'template.yaml',
            line: 2,
            column: 3,
          },
          attributeLocations: {
            Type: {
              path: 'template.yaml',
              line: 3,
              column: 5,
            },
          },
          attributes: {},
        },
      ]);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
      await rm(targetDirectory, { force: true, recursive: true });
    }
  });

  it('skips cloudformation symlink files', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/cloudformation/ebs-volume.yaml', import.meta.url));
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cloudburn-cfn-symlink-'));

    try {
      const symlinkPath = join(tempDirectory, 'template.yaml');

      await symlink(fixturePath, symlinkPath);

      const resources = await parseCloudFormation(tempDirectory);

      expect(resources).toEqual([]);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it('skips oversized cloudformation templates', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cloudburn-cfn-size-'));

    try {
      const templatePath = join(tempDirectory, 'large-template.yaml');
      const filler = 'A'.repeat(6 * 1024 * 1024);

      await writeFile(
        templatePath,
        [
          'Resources:',
          '  HugeTemplate:',
          '    Type: AWS::S3::Bucket',
          '    Metadata:',
          `      Notes: ${filler}`,
          '',
        ].join('\n'),
      );

      const resources = await parseCloudFormation(templatePath);

      expect(resources).toEqual([]);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
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
          line: 1,
          column: 1,
        },
        attributeLocations: {
          availability_zone: {
            path: 'main.tf',
            line: 2,
            column: 3,
          },
          size: {
            path: 'main.tf',
            line: 3,
            column: 3,
          },
          type: {
            path: 'main.tf',
            line: 4,
            column: 3,
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

  it('parses only the requested source kinds for dataset-driven static scans', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/iac-mixed', import.meta.url));
    const resources = await parseIaC(resourcePath, {
      sourceKinds: ['terraform'],
    });

    expect(resources.map((resource) => `${resource.location?.path}:${resource.type}.${resource.name}`)).toEqual([
      'main.tf:aws_ebs_volume.gp2_logs',
    ]);
  });
});
