import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loader.js';
import { mergeConfig } from '../src/config/merge.js';

describe('config loader', () => {
  it('loads default config in scaffold mode', async () => {
    const config = await loadConfig();

    expect(config.version).toBe(1);
    expect(config.profile).toBe('dev');
    expect('live' in config).toBe(false);
  });

  it('merges overrides onto a loaded config without discarding existing profile and rule maps', () => {
    const merged = mergeConfig(
      {
        profiles: {
          dev: {
            'aws-ebs-current-gen': {
              severity: 'high',
            },
          },
        },
        rules: {
          'aws-lambda-arm64': {
            enabled: true,
          },
        },
      },
      {
        version: 1,
        profile: 'prod',
        profiles: {
          dev: {
            'aws-ebs-current-gen': {
              enabled: true,
            },
          },
          prod: {
            'aws-ebs-current-gen': {
              enabled: false,
            },
          },
        },
        rules: {
          'aws-ebs-current-gen': {
            enabled: true,
          },
        },
        customRules: ['dist/custom-rule.js'],
      },
    );

    expect(merged).toEqual({
      version: 1,
      profile: 'prod',
      profiles: {
        dev: {
          'aws-ebs-current-gen': {
            enabled: true,
            severity: 'high',
          },
        },
        prod: {
          'aws-ebs-current-gen': {
            enabled: false,
          },
        },
      },
      rules: {
        'aws-ebs-current-gen': {
          enabled: true,
        },
        'aws-lambda-arm64': {
          enabled: true,
        },
      },
      customRules: ['dist/custom-rule.js'],
    });
  });
});
