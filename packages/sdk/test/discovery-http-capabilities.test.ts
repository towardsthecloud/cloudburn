import { describe, expect, it, vi } from 'vitest';
import type { AwsCapabilityReason, AwsCapabilityStatus } from '../src/index.js';
import {
  accountId,
  capabilitiesOf,
  discoverRules,
  expectReadOnlyRequests,
  held,
  region,
  requests,
  scenario,
  settleOnFakeTimers,
  useDiscoveryHttpHarness,
} from './helpers/discovery-http.js';

useDiscoveryHttpHarness();

describe('live capability outcomes', () => {
  it('reports Cost Optimization Hub enrollment as available when enrolled with empty recommendations', async () => {
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', 'CLDBRN-AWS-EBS-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', status: 'passed' }),
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-EBS-1', status: 'triggered' }),
      ]),
    );
    expectReadOnlyRequests();
  });

  it('reports Hub enrollment unavailable when the account is not enrolled and retains unrelated findings', async () => {
    scenario.hubEnrollmentStatus = 'Inactive';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', 'CLDBRN-AWS-EBS-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['not-enrolled'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', status: 'not_applicable' }),
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-EBS-1', status: 'triggered' }),
      ]),
    );
    expectReadOnlyRequests();
  });

  it('reports Hub enrollment unavailable with access-denied when enrollment status is denied', async () => {
    scenario.failOperation = 'ListEnrollmentStatuses';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('reports Hub enrollment as error when the enrollment status keeps failing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    scenario.transientOperation = 'ListEnrollmentStatuses';
    const pending = discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1']);
    const result = await settleOnFakeTimers(pending, 'ListEnrollmentStatuses');

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['service-error'],
        scope: { type: 'account' },
        status: 'error',
      },
    ]);
    expect(requests.filter((request) => request.operation === 'ListEnrollmentStatuses')).toHaveLength(6);
    expectReadOnlyRequests();
  });

  it('degrades Hub enrollment to partial when one recommendation category is denied', async () => {
    scenario.denyHubActionType = 'Upgrade';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-5']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: [
          'aws-cost-optimization-hub-savings-plans-recommendations',
          'aws-cost-optimization-hub-upgrade-recommendations',
        ],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'partial',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('degrades Cost Explorer access to partial when one dataset is denied', async () => {
    scenario.failOperation = 'GetAnomalyMonitors';
    const result = await discoverRules(['CLDBRN-AWS-COSTEXPLORER-1', 'CLDBRN-AWS-COSTGUARDRAILS-2']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-explorer-access',
        datasetKeys: ['aws-cost-anomaly-monitors', 'aws-cost-usage'],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'partial',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('keeps regional catalog findings working while account tagging lacks an aggregator', async () => {
    const result = await discoverRules(['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-TAGGING-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'resource-explorer-aggregator',
        datasetKeys: ['aws-resource-explorer-untagged-resources'],
        reasons: ['aggregator-required'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'CLDBRN-AWS-TAGGING-1', status: 'not_applicable' })]),
    );
    expectReadOnlyRequests();
  });

  it('reports untagged user resources without flagging AWS defaults and service-managed resources', async () => {
    scenario.aggregatorIndex = true;
    scenario.untaggedResources = [
      {
        Arn: 'arn:aws:apprunner:eu-west-1:111111111111:autoscalingconfiguration/DefaultConfiguration/1/00000000000000000000000000000001',
        OwningAccountId: accountId,
        Region: region,
        ResourceType: 'apprunner:autoscalingconfiguration',
        Service: 'apprunner',
      },
      {
        Arn: 'arn:aws:ec2:eu-west-1:111111111111:instance/i-user-created',
        OwningAccountId: accountId,
        Region: region,
        ResourceType: 'ec2:instance',
        Service: 'ec2',
        Properties: [{ Name: 'tags', Data: [{ Key: 'aws:cloudformation:stack-name', Value: 'user-stack' }] }],
      },
      ...[
        ['access-analyzer:analyzer', 'analyzer/_AccessAnalyzerForSecurityHubV2-abc'],
        ['athena:datacatalog', 'datacatalog/AwsDataCatalog'],
        ['athena:workgroup', 'workgroup/primary'],
        ['config:config-rule', 'config-rule/aws-service-rule/securityhub.amazonaws.com/config-rule-123'],
        ['elasticache:user', 'user:default'],
        ['events:event-bus', 'event-bus/default'],
        ['events:rule', 'rule/DO-NOT-DELETE-AmazonInspectorEc2ManagedRule'],
        ['iam:role', 'role/aws-service-role/securityhub.amazonaws.com/AWSServiceRoleForSecurityHub'],
        ['iam:role', 'role/aws-reserved/sso.amazonaws.com/eu-west-1/AWSReservedSSO_Admin_123'],
        ['iam:saml-provider', 'saml-provider/AWSSSO_123_DO_NOT_DELETE'],
        ['memorydb:acl', 'acl/open-access'],
        ['memorydb:parametergroup', 'parametergroup/default.memorydb-redis7'],
        ['memorydb:user', 'user/default'],
        ['s3:storage-lens', 'storage-lens/default-account-dashboard'],
        ['ssm:parameter', 'parameter/inspector-aws/service/inspector-linux-application-paths'],
        ['xray:sampling-rule', 'sampling-rule/Default'],
      ].map(([resourceType, resourceId]) => ({
        Arn: `arn:aws:${resourceType?.split(':')[0]}:${region}:${accountId}:${resourceId}`,
        OwningAccountId: accountId,
        Region: region,
        ResourceType: resourceType,
        Service: resourceType?.split(':')[0],
      })),
    ];

    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);

    expect(result.providers.flatMap((provider) => provider.rules)).toEqual([
      expect.objectContaining({
        ruleId: 'CLDBRN-AWS-TAGGING-1',
        findings: [
          {
            accountId,
            region,
            resourceId: 'arn:aws:ec2:eu-west-1:111111111111:instance/i-user-created',
          },
        ],
      }),
    ]);
    expect(result.evaluations?.resourceSets[0]?.resources.map((resource) => resource.resourceId)).toEqual([
      'arn:aws:ec2:eu-west-1:111111111111:instance/i-user-created',
    ]);
    expectReadOnlyRequests();
  });

  const setupTaggingMetadataScenario = () => {
    scenario.aggregatorIndex = true;
    scenario.untaggedResources = [
      ['ec2:vpc', 'vpc/vpc-default'],
      ['ec2:vpc', 'vpc/vpc-user'],
      ['ec2:dhcp-options', 'dhcp-options/dopt-default'],
      ['ec2:subnet', 'subnet/subnet-default'],
      ['ec2:subnet', 'subnet/subnet-user'],
      ['ec2:network-acl', 'network-acl/acl-default'],
      ['ec2:network-acl', 'network-acl/acl-user'],
      ['ec2:security-group', 'security-group/sg-default'],
      ['ec2:security-group', 'security-group/sg-user'],
      ['ec2:security-group-rule', 'security-group-rule/sgr-default'],
      ['ec2:security-group-rule', 'security-group-rule/sgr-user'],
      ['ec2:route-table', 'route-table/rtb-main'],
      ['ec2:route-table', 'route-table/rtb-former-default'],
      ['ec2:internet-gateway', 'internet-gateway/igw-default'],
      ['ec2:internet-gateway', 'internet-gateway/igw-former-default'],
      ['kms:key', 'key/managed'],
    ].map(([resourceType, resourceId]) => ({
      Arn: `arn:aws:${resourceType?.split(':')[0]}:${region}:${accountId}:${resourceId}`,
      OwningAccountId: accountId,
      Region: region,
      ResourceType: resourceType,
      Service: resourceType?.split(':')[0],
    }));
    scenario.taggingMetadataResponses = {
      DescribeVpcs:
        '<vpcSet><item><vpcId>vpc-default</vpcId><isDefault>true</isDefault></item><item><vpcId>vpc-user</vpcId><isDefault>false</isDefault></item></vpcSet>',
      DescribeDhcpOptions:
        '<dhcpOptionsSet><item><dhcpOptionsId>dopt-default</dhcpOptionsId><dhcpConfigurationSet><item><key>domain-name-servers</key><valueSet><item><value>AmazonProvidedDNS</value></item></valueSet></item><item><key>domain-name</key><valueSet><item><value>eu-west-1.compute.internal</value></item></valueSet></item></dhcpConfigurationSet></item></dhcpOptionsSet>',
      DescribeSubnets:
        '<subnetSet><item><subnetId>subnet-default</subnetId><defaultForAz>true</defaultForAz></item><item><subnetId>subnet-user</subnetId><defaultForAz>false</defaultForAz><vpcId>vpc-default</vpcId></item></subnetSet>',
      DescribeNetworkAcls:
        '<networkAclSet><item><networkAclId>acl-default</networkAclId><default>true</default></item><item><networkAclId>acl-user</networkAclId><default>false</default></item></networkAclSet>',
      DescribeSecurityGroups:
        '<securityGroupInfo><item><groupId>sg-default</groupId><groupName>default</groupName></item><item><groupId>sg-user</groupId><groupName>user</groupName></item></securityGroupInfo>',
      DescribeSecurityGroupRules:
        '<securityGroupRuleSet><item><securityGroupRuleId>sgr-default</securityGroupRuleId><groupId>sg-default</groupId></item><item><securityGroupRuleId>sgr-user</securityGroupRuleId><groupId>sg-user</groupId></item></securityGroupRuleSet>',
      DescribeKey: { KeyMetadata: { KeyManager: 'AWS' } },
    };
  };

  it('uses AWS metadata to exclude default network resources and managed keys while keeping uncertain ownership unknown', async () => {
    setupTaggingMetadataScenario();

    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);

    const userResources = [
      'network-acl/acl-user',
      'security-group-rule/sgr-user',
      'security-group/sg-user',
      'subnet/subnet-user',
      'vpc/vpc-user',
    ].map((resourceId) => ({ accountId, region, resourceId: `arn:aws:ec2:eu-west-1:111111111111:${resourceId}` }));
    expect(result.providers.flatMap((provider) => provider.rules).flatMap((rule) => rule.findings)).toEqual(
      userResources,
    );
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({
        ruleId: 'CLDBRN-AWS-TAGGING-1',
        coverage: {
          assessed: expect.arrayContaining(userResources),
          unknown: [
            'dhcp-options/dopt-default',
            'internet-gateway/igw-default',
            'internet-gateway/igw-former-default',
            'route-table/rtb-former-default',
            'route-table/rtb-main',
            'security-group-rule/sgr-default',
          ].map((resourceId) => ({
            accountId,
            region,
            resourceId: `arn:aws:ec2:eu-west-1:111111111111:${resourceId}`,
          })),
        },
        status: 'triggered',
      }),
    ]);
    expectReadOnlyRequests();
  });

  it('resolves independent tagging origin metadata while VPC metadata is blocked', async () => {
    setupTaggingMetadataScenario();
    delete scenario.taggingMetadataResponses.DescribeVpcs;
    scenario.holdOperation = 'DescribeVpcs';
    const controller = new AbortController();
    const scan = discoverRules(
      ['CLDBRN-AWS-TAGGING-1'],
      { mode: 'regions', regions: ['eu-west-1'] },
      { signal: controller.signal },
    );
    const outcome = scan.catch((error: unknown) => error);
    try {
      await vi.waitFor(() => expect(held).toHaveLength(1), { timeout: 10_000 });
      await vi.waitFor(
        () => {
          const operations = requests.map(({ operation }) => operation);
          for (const operation of [
            'DescribeDhcpOptions',
            'DescribeSubnets',
            'DescribeNetworkAcls',
            'DescribeSecurityGroups',
            'DescribeSecurityGroupRules',
            'DescribeKey',
          ]) {
            expect(operations).toContain(operation);
          }
          expect(operations.indexOf('DescribeSecurityGroupRules')).toBeGreaterThan(
            operations.indexOf('DescribeSecurityGroups'),
          );
        },
        { timeout: 10_000 },
      );
    } finally {
      controller.abort();
      for (const request of held) request.release();
      await outcome;
    }
  });

  it('keeps user-created resources with default-like names in the tagging rule', async () => {
    scenario.aggregatorIndex = true;
    const expectedArns = [
      'arn:aws:apprunner:eu-west-1:111111111111:autoscalingconfiguration/DefaultConfiguration/1/customer-id',
      'arn:aws:apprunner:eu-west-1:111111111111:autoscalingconfiguration/DefaultConfiguration/2/00000000000000000000000000000001',
      'arn:aws:athena:eu-west-1:111111111111:datacatalog/custom',
      'arn:aws:athena:eu-west-1:111111111111:workgroup/primary-custom',
      'arn:aws:config:eu-west-1:111111111111:config-rule/config-rule-customer',
      'arn:aws:elasticache:eu-west-1:111111111111:user:default.iam-user',
      'arn:aws:events:eu-west-1:111111111111:event-bus/default-custom',
      'arn:aws:iam::111111111111:role/AWSCloudFormationStackSetExecutionRole',
      'arn:aws:logs:eu-west-1:111111111111:log-group:/aws/lambda/customer-function',
      'arn:aws:memorydb:eu-west-1:111111111111:acl/open-access-custom',
      'arn:aws:memorydb:eu-west-1:111111111111:parametergroup/default-custom',
      'arn:aws:s3:eu-west-1:111111111111:storage-lens/default-account-dashboard-custom',
      'arn:aws:xray:eu-west-1:111111111111:sampling-rule/Default-custom',
    ];
    const resourceTypes = [
      'apprunner:autoscalingconfiguration',
      'apprunner:autoscalingconfiguration',
      'athena:datacatalog',
      'athena:workgroup',
      'config:config-rule',
      'elasticache:user',
      'events:event-bus',
      'iam:role',
      'logs:log-group',
      'memorydb:acl',
      'memorydb:parametergroup',
      's3:storage-lens',
      'xray:sampling-rule',
    ];
    scenario.untaggedResources = expectedArns.map((Arn, index) => ({
      Arn,
      OwningAccountId: accountId,
      Region: index === 7 ? 'global' : region,
      ResourceType: resourceTypes[index],
      Service: Arn.split(':')[2],
    }));
    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);
    expect(
      result.providers
        .flatMap((provider) => provider.rules)
        .flatMap((rule) => rule.findings)
        .map((finding) => finding.resourceId)
        .sort(),
    ).toEqual([...expectedArns].sort());
    expectReadOnlyRequests();
  });

  it('paginates ownership metadata before deciding which untagged VPCs are user-created', async () => {
    scenario.aggregatorIndex = true;
    scenario.untaggedResources = ['vpc-default', 'vpc-user'].map((id) => ({
      Arn: `arn:aws:ec2:${region}:${accountId}:vpc/${id}`,
      OwningAccountId: accountId,
      Region: region,
      ResourceType: 'ec2:vpc',
      Service: 'ec2',
    }));
    scenario.taggingMetadataResponses = {
      'DescribeVpcs:':
        '<vpcSet><item><vpcId>vpc-default</vpcId><isDefault>true</isDefault></item></vpcSet><nextToken>page-two</nextToken>',
      'DescribeVpcs:page-two': '<vpcSet><item><vpcId>vpc-user</vpcId><isDefault>false</isDefault></item></vpcSet>',
    };
    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);
    expect(result.providers.flatMap((provider) => provider.rules).flatMap((rule) => rule.findings)).toEqual([
      { accountId, region, resourceId: 'arn:aws:ec2:eu-west-1:111111111111:vpc/vpc-user' },
    ]);
    expect(result.evaluations?.rules[0]?.coverage?.unknown).toEqual([]);
    expectReadOnlyRequests();
  });

  it('retains valid untagged VPC findings when a catalog ID no longer exists', async () => {
    scenario.aggregatorIndex = true;
    scenario.untaggedResources = ['vpc-default', 'vpc-deleted', 'vpc-user'].map((id) => ({
      Arn: `arn:aws:ec2:${region}:${accountId}:vpc/${id}`,
      OwningAccountId: accountId,
      Region: region,
      ResourceType: 'ec2:vpc',
      Service: 'ec2',
    }));
    scenario.taggingMetadataResponses = {
      DescribeVpcs: (input) => {
        const ids = Object.entries(input)
          .filter(([key]) => key.startsWith('VpcId.'))
          .map(([, id]) => id);
        const missing = ids.includes('vpc-deleted');
        return {
          response: {
            statusCode: missing ? 400 : 200,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from(
              missing
                ? '<Response><Errors><Error><Code>InvalidVpcID.NotFound</Code><Message>The VPC does not exist.</Message></Error></Errors><RequestID>synthetic</RequestID></Response>'
                : `<DescribeVpcsResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/"><vpcSet>${ids.map((id) => `<item><vpcId>${id}</vpcId><isDefault>${id === 'vpc-default'}</isDefault></item>`).join('')}</vpcSet></DescribeVpcsResponse>`,
            ),
          },
        };
      },
    };

    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);

    expect(result.providers.flatMap((provider) => provider.rules).flatMap((rule) => rule.findings)).toEqual([
      { accountId, region, resourceId: 'arn:aws:ec2:eu-west-1:111111111111:vpc/vpc-user' },
    ]);
    expect(result.evaluations?.rules[0]).toMatchObject({
      ruleId: 'CLDBRN-AWS-TAGGING-1',
      status: 'triggered',
      coverage: {
        assessed: [{ accountId, region, resourceId: 'arn:aws:ec2:eu-west-1:111111111111:vpc/vpc-user' }],
        unknown: [{ accountId, region, resourceId: 'arn:aws:ec2:eu-west-1:111111111111:vpc/vpc-deleted' }],
      },
    });
    expectReadOnlyRequests();
  });

  it.each(['denied', 'missing'] as const)(
    'keeps %s ownership metadata unknown instead of flagging a resource or passing the tagging rule',
    async (metadata) => {
      scenario.aggregatorIndex = true;
      scenario.untaggedResources = [
        {
          Arn: 'arn:aws:kms:eu-west-1:111111111111:key/uncertain',
          OwningAccountId: accountId,
          Region: region,
          ResourceType: 'kms:key',
          Service: 'kms',
        },
      ];
      if (metadata === 'denied') scenario.failOperation = 'DescribeKey';
      else scenario.taggingMetadataResponses = { DescribeKey: {} };
      const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);
      expect(result.providers).toEqual([]);
      expect(result.evaluations?.rules).toEqual([
        expect.objectContaining({
          ruleId: 'CLDBRN-AWS-TAGGING-1',
          status: 'unknown',
          coverage: {
            assessed: [],
            unknown: [{ accountId, region, resourceId: 'arn:aws:kms:eu-west-1:111111111111:key/uncertain' }],
          },
        }),
      ]);
      expect(result.evaluations?.resourceSets[0]?.resources[0]?.data).toEqual({ creationOrigin: 'unknown' });
      expectReadOnlyRequests();
    },
  );

  it.each([
    {
      resourceType: 'kms:key',
      operation: 'DescribeKey',
      code: 'NotFoundException',
      arn: 'arn:aws:kms:eu-west-1:111111111111:key/deleted',
    },
    {
      resourceType: 'ssm:association',
      operation: 'DescribeAssociation',
      code: 'AssociationDoesNotExist',
      arn: 'arn:aws:ssm:eu-west-1:111111111111:association/deleted',
    },
  ])('keeps deleted $resourceType candidates unknown without skipping valid tagging findings', async (candidate) => {
    scenario.aggregatorIndex = true;
    scenario.untaggedResources = [
      {
        Arn: candidate.arn,
        OwningAccountId: accountId,
        Region: region,
        ResourceType: candidate.resourceType,
        Service: candidate.resourceType.split(':')[0],
      },
      {
        Arn: 'arn:aws:logs:eu-west-1:111111111111:log-group:/aws/lambda/customer-function',
        OwningAccountId: accountId,
        Region: region,
        ResourceType: 'logs:log-group',
        Service: 'logs',
      },
    ];
    scenario.taggingMetadataResponses = {
      [candidate.operation]: () => ({
        response: {
          statusCode: 400,
          headers: { 'content-type': 'application/json', 'x-amzn-errortype': candidate.code },
          body: Buffer.from('{"message":"The resource no longer exists."}'),
        },
      }),
    };

    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);

    expect(result.providers.flatMap((provider) => provider.rules).flatMap((rule) => rule.findings)).toEqual([
      {
        accountId,
        region,
        resourceId: 'arn:aws:logs:eu-west-1:111111111111:log-group:/aws/lambda/customer-function',
      },
    ]);
    expect(result.evaluations?.rules[0]).toMatchObject({
      ruleId: 'CLDBRN-AWS-TAGGING-1',
      status: 'triggered',
      coverage: { unknown: [{ accountId, region, resourceId: candidate.arn }] },
    });
    expectReadOnlyRequests();
  });

  it('excludes Inspector-managed SSM associations while retaining customer associations', async () => {
    scenario.aggregatorIndex = true;
    scenario.untaggedResources = ['inspector', 'customer'].map((id) => ({
      Arn: `arn:aws:ssm:${region}:${accountId}:association/${id}`,
      OwningAccountId: accountId,
      Region: region,
      ResourceType: 'ssm:association',
      Service: 'ssm',
    }));
    scenario.taggingMetadataResponses = {
      'DescribeAssociation:inspector': {
        AssociationDescription: {
          AssociationId: 'inspector',
          AssociationName: 'InspectorDistributor-do-not-delete',
          Name: 'AmazonInspector2-ConfigureInspectorSsmPlugin',
        },
      },
      'DescribeAssociation:customer': {
        AssociationDescription: {
          AssociationId: 'customer',
          AssociationName: 'customer-inventory',
          Name: 'AWS-GatherSoftwareInventory',
        },
      },
    };
    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);
    expect(result.providers.flatMap((provider) => provider.rules).flatMap((rule) => rule.findings)).toEqual([
      { accountId, region, resourceId: 'arn:aws:ssm:eu-west-1:111111111111:association/customer' },
    ]);
    expectReadOnlyRequests();
  });

  it('reports the tagging capability available when an accessible aggregator answers an empty query', async () => {
    scenario.aggregatorIndex = true;
    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'resource-explorer-aggregator',
        datasetKeys: ['aws-resource-explorer-untagged-resources'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-TAGGING-1', status: 'passed' }),
    ]);
    expectReadOnlyRequests();
  });

  it.each<{
    body?: unknown;
    dataUnavailable?: boolean;
    sageMakerUnused?: boolean;
    expected: { reasons: AwsCapabilityReason[]; status: AwsCapabilityStatus };
    ruleStatus: 'passed' | 'not_applicable';
  }>([
    {
      expected: { reasons: [], status: 'available' },
      ruleStatus: 'passed',
    },
    {
      sageMakerUnused: true,
      expected: { reasons: [], status: 'available' },
      ruleStatus: 'passed',
    },
    {
      body: { SavingsPlansCoverages: [{ Attributes: { SERVICE: 'Amazon SageMaker' } }] },
      expected: { reasons: ['incomplete-evidence'], status: 'unavailable' },
      ruleStatus: 'not_applicable',
    },
    {
      dataUnavailable: true,
      expected: { reasons: ['data-unavailable'], status: 'unavailable' },
      ruleStatus: 'not_applicable',
    },
  ])(
    'projects SageMaker coverage evidence onto Cost Explorer access',
    async ({ body, dataUnavailable, sageMakerUnused, expected, ruleStatus }) => {
      if (body !== undefined) scenario.savingsPlansCoverageResponse = body;
      if (dataUnavailable) scenario.savingsPlansDataUnavailable = true;
      if (sageMakerUnused) scenario.savingsPlansSageMakerUnused = true;
      const result = await discoverRules(['CLDBRN-AWS-SAGEMAKER-3']);

      expect(capabilitiesOf(result)).toEqual([
        {
          capability: 'cost-explorer-access',
          datasetKeys: ['aws-sagemaker-savings-plans-coverage'],
          reasons: expected.reasons,
          scope: { type: 'account' },
          status: expected.status,
        },
      ]);
      expect(result.evaluations?.rules).toEqual([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-SAGEMAKER-3', status: ruleStatus }),
      ]);
      expectReadOnlyRequests();
    },
  );
});
