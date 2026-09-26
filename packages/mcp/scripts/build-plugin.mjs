#!/usr/bin/env node

// Builds the distributable agent plugin into dist/plugin. Every manifest and MCP launcher is stamped with this
// package's version so the plugin always starts the exact @cloudburn/mcp release it was built with.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const source = join(packageRoot, 'plugin');
const target = join(packageRoot, 'dist', 'plugin');
const { name, version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

const updateJson = (path, update) => {
  const file = join(target, path);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  update(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const pinLauncher = (config) => {
  for (const server of Object.values(config.mcpServers)) {
    server.args = server.args.map((arg) => (arg === name ? `${name}@${version}` : arg));
    if (!server.args.includes(`${name}@${version}`)) {
      throw new Error(`MCP server does not launch ${name}; update plugin MCP configuration.`);
    }
  }
};

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
cpSync(join(packageRoot, '..', '..', 'LICENSE'), join(target, 'LICENSE'));
updateJson('.claude-plugin/plugin.json', (manifest) => Object.assign(manifest, { version }));
updateJson('plugin.json', (manifest) => Object.assign(manifest, { version }));
updateJson('.mcp.json', pinLauncher);
updateJson('mcp.json', pinLauncher);
