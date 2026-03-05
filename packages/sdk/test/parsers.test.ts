import { describe, expect, it } from 'vitest';
import { parseCloudFormation, parseTerraform } from '../src/parsers/index.js';

describe('parsers', () => {
  it('returns empty terraform resources in scaffold mode', async () => {
    const resources = await parseTerraform('fixtures/example.tf');

    expect(resources).toEqual([]);
  });

  it('returns empty cloudformation resources in scaffold mode', async () => {
    const resources = await parseCloudFormation('fixtures/template.yaml');

    expect(resources).toEqual([]);
  });
});
