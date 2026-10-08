import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTerraform } from '../src/parsers/terraform.js';
import { scanTerraformLine } from '../src/parsers/terraform-lexer.js';

vi.mock('../src/parsers/terraform-lexer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/terraform-lexer.js')>();
  return { ...actual, scanTerraformLine: vi.fn(actual.scanTerraformLine) };
});

describe('Terraform resource locator', () => {
  beforeEach(() => {
    vi.mocked(scanTerraformLine).mockClear();
  });

  it('scans large heredocs once for suppression extraction and once for resource locations', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cloudburn-terraform-heredoc-resource-locator-'));
    const terraformPath = join(tempDirectory, 'main.tf');

    try {
      const heredocResourceLines = Array.from({ length: 2_000 }, () => 'resource "aws_instance" "fake" {');
      const contents = [
        'resource "aws_ebs_volume" "before" {',
        '  type = "gp2"',
        '  availability_zone = "eu-west-1a"',
        '}',
        'locals {',
        '  payload = <<EOT',
        ...heredocResourceLines,
        'EOT',
        '}',
        'resource "aws_ebs_volume" "after" {',
        '  type = "gp2"',
        '  availability_zone = "eu-west-1b"',
        '}',
        '',
      ].join('\n');
      await writeFile(terraformPath, contents, 'utf8');

      const { resources } = await parseTerraform(terraformPath);

      expect(resources.map((resource) => resource.name)).toEqual(['before', 'after']);
      expect(resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'before',
            location: { path: 'main.tf', line: 1, column: 1 },
            attributeLocations: {
              type: { path: 'main.tf', line: 2, column: 3 },
              availability_zone: { path: 'main.tf', line: 3, column: 3 },
            },
          }),
          expect.objectContaining({
            name: 'after',
            location: { path: 'main.tf', line: 2_009, column: 1 },
            attributeLocations: {
              type: { path: 'main.tf', line: 2_010, column: 3 },
              availability_zone: { path: 'main.tf', line: 2_011, column: 3 },
            },
          }),
        ]),
      );
      expect(vi.mocked(scanTerraformLine).mock.calls.length).toBeLessThanOrEqual(2 * contents.split('\n').length);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
