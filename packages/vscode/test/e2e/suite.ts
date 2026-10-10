import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

/**
 * Exercises the installed editor commands against the real built CLI.
 * @returns A promise that rejects when an editor contract fails.
 */
export const run = async (): Promise<void> => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'The extension test needs a workspace folder.');
  const extension = vscode.extensions.getExtension('dannysteenman.cloudburn-vscode');
  assert.ok(extension, 'VS Code must discover the extension manifest.');
  await extension.activate();
  const config = vscode.workspace.getConfiguration('cloudburn', folder.uri);
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    const folderConfig = vscode.workspace.getConfiguration('cloudburn', workspaceFolder.uri);
    await folderConfig.update(
      'executable',
      process.env.CLOUDBURN_TEST_NODE,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await folderConfig.update(
      'arguments',
      [process.env.CLOUDBURN_TEST_CLI],
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await folderConfig.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  }

  const path = join(folder.uri.fsPath, 'main.tf');
  await writeFile(
    path,
    'resource "aws_ebs_volume" "legacy" {\n  availability_zone = "us-east-1a"\n  size = 8\n  type = "gp2"\n}\n',
  );
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  const findings = vscode.languages.getDiagnostics(vscode.Uri.file(path)).filter((item) => item.source === 'CloudBurn');
  assert.equal(findings.length, 1, 'The workspace command must publish the real CLI finding.');
  assert.equal(findings[0]?.message.includes('aws_ebs_volume.legacy'), true);
  assert.equal(findings[0]?.range.start.line, 3);
  assert.equal(findings[0]?.range.start.character, 2);
  assert.equal(findings[0]?.severity, vscode.DiagnosticSeverity.Warning);
  assert.equal(typeof findings[0]?.code === 'object' && findings[0].code.value, 'CLDBRN-AWS-EBS-1');
  console.log('PASS: workspace command publishes a located Terraform finding from the real CLI');

  await config.update('scanOnSave', true, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  await replaceAndSave(document, document.getText().replace('gp2', 'gp3'), 0);
  await replaceAndSave(document, document.getText().replace('gp3', 'gp2'), 1);
  await replaceAndSave(document, document.getText().replace('gp2', 'gp3'), 0);
  console.log('PASS: saving introduces and clears findings through the real CLI');

  await config.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  const yaml = vscode.Uri.file(join(folder.uri.fsPath, 'template.yaml'));
  const json = vscode.Uri.file(join(folder.uri.fsPath, 'template.json'));
  await writeFile(
    yaml.fsPath,
    'Resources:\n  Legacy:\n    Type: AWS::EC2::Volume\n    Properties:\n      AvailabilityZone: us-east-1a\n      VolumeType: gp2\n      Size: 8\n',
  );
  await writeFile(
    json.fsPath,
    JSON.stringify(
      {
        Resources: {
          Oversized: {
            Type: 'AWS::EC2::Volume',
            Properties: { AvailabilityZone: 'us-east-1a', VolumeType: 'gp3', Size: 500 },
          },
        },
      },
      null,
      2,
    ),
  );
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  const yamlFinding = costFindings(yaml)[0];
  assert.equal(costFindings(yaml).length, 1);
  assert.equal(yamlFinding?.range.start.line, 5);
  assert.equal(yamlFinding?.range.start.character, 6);
  assert.equal(
    typeof yamlFinding?.code === 'object' && yamlFinding.code.target.toString(),
    'https://cloudburn.io/docs/rules/aws/ebs#cldbrn-aws-ebs-1',
  );
  assert.equal(costFindings(json).length, 1);
  assert.equal(costFindings(json)[0]?.severity, vscode.DiagnosticSeverity.Error);
  console.log('PASS: YAML and JSON CloudFormation findings retain their locations and severities');

  const configPath = join(folder.uri.fsPath, 'policy.yml');
  await writeFile(configPath, 'iac:\n  enabled-rules: [CLDBRN-AWS-EBS-1]\n  fail-on: medium\n');
  await config.update('configPath', 'policy.yml', vscode.ConfigurationTarget.WorkspaceFolder);
  await writeFile(
    path,
    '# cloudburn-ignore CLDBRN-AWS-EBS-1 retained for compatibility\nresource "aws_ebs_volume" "legacy" {\n  availability_zone = "us-east-1a"\n  size = 8\n  type = "gp2"\n}\n',
  );
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(vscode.Uri.file(path)).length, 0, 'Suppressed resources must not produce editor warnings.');
  assert.equal(costFindings(yaml).length, 1, 'Policy exit code 1 must still publish active findings.');
  assert.equal(costFindings(json).length, 0, 'The CLI configuration must select the editor rules.');
  console.log('PASS: explicit workspace policy, suppressions, and policy exit code 1 are preserved');

  const broken = vscode.Uri.file(join(folder.uri.fsPath, 'broken.tf'));
  await writeFile(broken.fsPath, 'resource "aws_ebs_volume" "broken" {');
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.ok(
    vscode.languages
      .getDiagnostics(folder.uri)
      .some((item) => item.source === 'CloudBurn' && item.message.includes('could not be parsed')),
  );
  console.log('PASS: skipped files remain visible as incomplete scan diagnostics');

  await config.update(
    'executable',
    join(folder.uri.fsPath, 'missing-cloudburn'),
    vscode.ConfigurationTarget.WorkspaceFolder,
  );
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(yaml).length, 0, 'Failed scans must remove outdated findings.');
  assert.ok(
    vscode.languages
      .getDiagnostics(folder.uri)
      .some((item) => item.code === 'scan-failed' && item.message.includes('CLI was not found')),
  );
  await config.update('executable', process.env.CLOUDBURN_TEST_NODE, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(yaml).length, 1, 'Scanning must recover after correcting the launcher.');
  console.log('PASS: missing CLI errors are actionable and a subsequent scan recovers');

  const sibling = vscode.workspace.workspaceFolders?.[1]?.uri;
  assert.ok(sibling, 'The extension test needs a second workspace folder.');
  const siblingFile = vscode.Uri.file(join(sibling.fsPath, 'main.tf'));
  await writeFile(
    siblingFile.fsPath,
    'resource "aws_ebs_volume" "sibling" {\n  availability_zone = "us-east-1a"\n  type = "gp2"\n  size = 8\n}\n',
  );
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(siblingFile).length, 1);
  assert.equal(costFindings(yaml).length, 1, 'Scanning a sibling must preserve the first folder findings.');
  assert.ok(vscode.languages.getDiagnostics(folder.uri).some((item) => item.message.includes('could not be parsed')));
  console.log('PASS: multi-root scans retain findings and incomplete coverage independently');

  const deleted = waitForDiagnostics(yaml, () => costFindings(yaml).length === 0);
  const deletion = new vscode.WorkspaceEdit();
  deletion.deleteFile(yaml);
  await vscode.workspace.applyEdit(deletion);
  await deleted;
  assert.equal(costFindings(siblingFile).length, 1, 'Deleting a file must preserve sibling diagnostics.');
  console.log('PASS: deleted files do not retain stale cost findings');
};

const costFindings = (uri: vscode.Uri): vscode.Diagnostic[] =>
  vscode.languages.getDiagnostics(uri).filter((item) => item.source === 'CloudBurn' && typeof item.code === 'object');

const waitForDiagnostics = (uri: vscode.Uri, predicate: () => boolean): Promise<void> =>
  new Promise((accept, reject) => {
    const timeout = setTimeout(() => {
      listener.dispose();
      reject(new Error(`Diagnostics did not update for ${uri.fsPath}.`));
    }, 10_000);
    const listener = vscode.languages.onDidChangeDiagnostics((event) => {
      if (!event.uris.some((changed) => changed.toString() === uri.toString()) || !predicate()) return;
      clearTimeout(timeout);
      listener.dispose();
      accept();
    });
  });

const replaceAndSave = async (document: vscode.TextDocument, text: string, findingCount: number): Promise<void> => {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
  await vscode.workspace.applyEdit(edit);
  const updated = waitForDiagnostics(document.uri, () => costFindings(document.uri).length === findingCount);
  await document.save();
  await updated;
};
