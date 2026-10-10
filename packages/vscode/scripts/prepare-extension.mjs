import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const extensionRoot = resolve(packageRoot, 'dist/vscode');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
manifest.name = 'cloudburn-vscode';
delete manifest.scripts;
delete manifest.devDependencies;

await mkdir(resolve(extensionRoot, 'dist'), { recursive: true });
await writeFile(resolve(extensionRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await Promise.all([
  ...['README.md', 'CHANGELOG.md', 'icon.png', '.vscodeignore'].map((file) =>
    copyFile(resolve(packageRoot, file), resolve(extensionRoot, file)),
  ),
  copyFile(resolve(packageRoot, '../../LICENSE'), resolve(extensionRoot, 'LICENSE')),
  copyFile(resolve(packageRoot, 'dist/extension.cjs'), resolve(extensionRoot, 'dist/extension.cjs')),
]);
