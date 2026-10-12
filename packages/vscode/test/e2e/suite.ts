import assert from 'node:assert/strict';
import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
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
  const activationDeadline = Date.now() + 5000;
  while (!extension.isActive && Date.now() < activationDeadline) {
    await new Promise((accept) => setTimeout(accept, 50));
  }
  assert.ok(extension.isActive, 'An empty workspace must activate CloudBurn before its first IaC save.');
  const config = vscode.workspace.getConfiguration('cloudburn', folder.uri);

  const unscanned = vscode.workspace.workspaceFolders?.[1];
  assert.ok(unscanned, 'The unscanned-folder test needs a second workspace folder.');
  await config.update(
    'executable',
    join(unscanned.uri.fsPath, 'missing-cloudburn'),
    vscode.ConfigurationTarget.Workspace,
  );
  const notes = vscode.Uri.file(join(unscanned.uri.fsPath, 'notes.txt'));
  await writeFile(notes.fsPath, '');
  const renameNotes = new vscode.WorkspaceEdit();
  renameNotes.renameFile(notes, vscode.Uri.file(join(unscanned.uri.fsPath, 'notes.md')));
  await vscode.workspace.applyEdit(renameNotes);
  await new Promise((accept) => setTimeout(accept, 1500));
  assert.equal(
    vscode.languages.getDiagnostics(unscanned.uri).filter((item) => item.source === 'CloudBurn').length,
    0,
    'Renaming a file in a never-scanned folder must not start a scan.',
  );
  await config.update('executable', undefined, vscode.ConfigurationTarget.Workspace);
  console.log('PASS: renaming a file in a never-scanned folder starts no scan');

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
  }

  const firstTerraform = vscode.Uri.file(join(folder.uri.fsPath, 'first.tf'));
  await writeFile(firstTerraform.fsPath, '');
  const firstDocument = await vscode.workspace.openTextDocument(firstTerraform);
  assert.equal(
    firstDocument.languageId,
    'plaintext',
    'The first-save regression needs no Terraform language extension.',
  );
  await replaceAndSave(
    firstDocument,
    'resource "aws_ebs_volume" "first" {\n  availability_zone = "us-east-1a"\n  size = 8\n  type = "gp2"\n}\n',
    1,
  );
  await replaceAndSave(firstDocument, firstDocument.getText().replace('gp2', 'gp3'), 0);
  console.log('PASS: the first plaintext Terraform save in an initially empty workspace scans automatically');
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    await vscode.workspace
      .getConfiguration('cloudburn', workspaceFolder.uri)
      .update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
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
  await config.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  assert.equal(costFindings(vscode.Uri.file(path)).length, 1, 'Disabling save scans must retain existing findings.');
  console.log('PASS: changing automatic-save settings preserves existing findings');

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

  await config.update('scanOnSave', true, vscode.ConfigurationTarget.WorkspaceFolder);
  const complete = waitForDiagnostics(
    folder.uri,
    () =>
      !vscode.languages
        .getDiagnostics(folder.uri)
        .some((item) => item.source === 'CloudBurn' && item.message.includes('could not be parsed')),
  );
  const removeSkipped = new vscode.WorkspaceEdit();
  removeSkipped.deleteFile(broken);
  await vscode.workspace.applyEdit(removeSkipped);
  const mainDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  const saveEdit = new vscode.WorkspaceEdit();
  saveEdit.replace(
    mainDocument.uri,
    new vscode.Range(0, 0, mainDocument.lineCount, 0),
    mainDocument.getText().replace('type = "gp2"', 'type = "gp3"'),
  );
  await vscode.workspace.applyEdit(saveEdit);
  await mainDocument.save();
  await config.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  await complete;
  assert.equal(costFindings(yaml).length, 1, 'Deleting a skipped file must retain active findings.');
  assert.equal(costFindings(siblingFile).length, 1, 'Deleting a skipped file must preserve sibling findings.');
  console.log('PASS: deleting skipped files refreshes coverage after a coalesced save and disabled save scans');

  const siblingFolder = vscode.workspace.workspaceFolders?.[1];
  assert.ok(siblingFolder, 'The shared-config test needs a second workspace folder.');
  const siblingConfig = vscode.workspace.getConfiguration('cloudburn', siblingFolder.uri);
  const sharedPolicyPath = join(dirname(folder.uri.fsPath), 'shared-policy.policy');
  const sharedPolicyAliasPath = join(dirname(folder.uri.fsPath), 'shared-policy-alias.policy');
  const sharedPolicy = vscode.Uri.file(sharedPolicyPath);
  await writeFile(sharedPolicyPath, 'iac:\n  enabled-rules: [CLDBRN-AWS-EBS-1]\n');
  await symlink(sharedPolicyPath, sharedPolicyAliasPath, 'file');
  await config.update('configPath', sharedPolicyPath, vscode.ConfigurationTarget.WorkspaceFolder);
  await siblingConfig.update(
    'configPath',
    relative(siblingFolder.uri.fsPath, sharedPolicyPath),
    vscode.ConfigurationTarget.WorkspaceFolder,
  );
  await config.update('scanOnSave', true, vscode.ConfigurationTarget.WorkspaceFolder);
  await siblingConfig.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update('configPath', sharedPolicyAliasPath, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(yaml).length, 1);
  assert.equal(costFindings(siblingFile).length, 1);
  const sharedPolicyDocument = await vscode.workspace.openTextDocument(sharedPolicy);
  const disableFirst = waitForDiagnostics(yaml, () => costFindings(yaml).length === 0);
  const disabledPolicyEdit = new vscode.WorkspaceEdit();
  disabledPolicyEdit.replace(
    sharedPolicyDocument.uri,
    new vscode.Range(0, 0, sharedPolicyDocument.lineCount, 0),
    'iac:\n  services: [ec2]\n',
  );
  await vscode.workspace.applyEdit(disabledPolicyEdit);
  await sharedPolicyDocument.save();
  await disableFirst;
  assert.equal(costFindings(siblingFile).length, 1, 'A root with save scans disabled must retain its findings.');
  const alternateCasePath = join(dirname(sharedPolicyPath), 'Shared-policy.policy');
  const canonicalPolicyPath = await realpath(sharedPolicyPath);
  const alternateCaseIdentity = await realpath(alternateCasePath).catch(() => undefined);
  if (alternateCaseIdentity === canonicalPolicyPath) {
    await config.update('configPath', alternateCasePath, vscode.ConfigurationTarget.WorkspaceFolder);
    const restoreFirst = waitForDiagnostics(yaml, () => costFindings(yaml).length === 1);
    const enabledPolicyEdit = new vscode.WorkspaceEdit();
    enabledPolicyEdit.replace(
      sharedPolicyDocument.uri,
      new vscode.Range(0, 0, sharedPolicyDocument.lineCount, 0),
      'iac:\n  enabled-rules: [CLDBRN-AWS-EBS-1]\n',
    );
    await vscode.workspace.applyEdit(enabledPolicyEdit);
    await sharedPolicyDocument.save();
    await restoreFirst;
    const disableCaseVariant = waitForDiagnostics(yaml, () => costFindings(yaml).length === 0);
    const disabledCaseVariantEdit = new vscode.WorkspaceEdit();
    disabledCaseVariantEdit.replace(
      sharedPolicyDocument.uri,
      new vscode.Range(0, 0, sharedPolicyDocument.lineCount, 0),
      'iac:\n  services: [ec2]\n',
    );
    await vscode.workspace.applyEdit(disabledCaseVariantEdit);
    await sharedPolicyDocument.save();
    await disableCaseVariant;
    console.log('PASS: alternate-case config paths refresh on case-insensitive filesystems');
  } else {
    console.log('SKIP: alternate-case config paths require a case-insensitive filesystem');
  }
  await config.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  await siblingConfig.update('scanOnSave', true, vscode.ConfigurationTarget.WorkspaceFolder);
  const disableSibling = waitForDiagnostics(siblingFile, () => costFindings(siblingFile).length === 0);
  const resavePolicy = new vscode.WorkspaceEdit();
  resavePolicy.replace(
    sharedPolicyDocument.uri,
    new vscode.Range(0, 0, sharedPolicyDocument.lineCount, 0),
    `# second save\n${sharedPolicyDocument.getText()}`,
  );
  await vscode.workspace.applyEdit(resavePolicy);
  await sharedPolicyDocument.save();
  await disableSibling;
  await config.update('configPath', 'policy.yml', vscode.ConfigurationTarget.WorkspaceFolder);
  await siblingConfig.update('configPath', '', vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  await siblingConfig.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(yaml).length, 1, 'Absolute shared configs must rescan their referencing root.');
  assert.equal(costFindings(siblingFile).length, 1, 'Sibling-relative shared configs must rescan their root.');
  console.log(
    'PASS: saving a shared external policy refreshes absolute and sibling-relative roots by their own settings',
  );

  const originalArguments = config.get<string[]>('arguments', []);
  const originalExecutable = config.get<string>('executable', 'cloudburn');
  const originalConfigPath = config.get<string>('configPath', '');
  const originalScanOnSave = config.get<boolean>('scanOnSave', true);
  const syntheticLauncher = join(folder.uri.fsPath, 'synthetic-cloudburn.mjs');
  const syntheticResult = {
    providers: [
      {
        provider: 'aws',
        rules: [
          {
            ruleId: 'CLDBRN-AWS-EBS-1',
            service: 'ebs',
            source: 'iac',
            severity: 'high',
            message: 'Synthetic unlocated finding',
            findings: [{ resourceId: 'aws_ebs_volume.unlocated' }],
          },
        ],
      },
    ],
    diagnostics: [{ status: 'unknown', code: 'synthetic-coverage', message: 'Synthetic incomplete coverage' }],
  };
  await writeFile(syntheticLauncher, `process.stdout.write(${JSON.stringify(JSON.stringify(syntheticResult))});\n`);
  try {
    await config.update('arguments', [syntheticLauncher], vscode.ConfigurationTarget.WorkspaceFolder);
    await vscode.commands.executeCommand('cloudburn.scanWorkspace');
    const folderDiagnostics = vscode.languages.getDiagnostics(folder.uri).filter((item) => item.source === 'CloudBurn');
    assert.equal(folderDiagnostics.length, 2, 'Folder findings and coverage must share one diagnostic entry.');
    const unlocated = folderDiagnostics.find(
      (item) => typeof item.code === 'object' && item.code.value === 'CLDBRN-AWS-EBS-1',
    );
    assert.ok(unlocated, 'An unlocated finding must be shown at the workspace folder.');
    assert.equal(unlocated.message, 'Synthetic unlocated finding (aws_ebs_volume.unlocated)');
    assert.equal(unlocated.severity, vscode.DiagnosticSeverity.Error);
    assert.ok(unlocated.range.isEqual(new vscode.Range(0, 0, 0, 0)));
    assert.equal(
      typeof unlocated.code === 'object' && unlocated.code.target.toString(),
      'https://cloudburn.io/docs/rules/aws/ebs#cldbrn-aws-ebs-1',
    );
    assert.ok(folderDiagnostics.some((item) => item.code === 'synthetic-coverage'));
    console.log('PASS: unlocated findings and coverage diagnostics coexist at the workspace folder');
  } finally {
    await config.update('arguments', originalArguments, vscode.ConfigurationTarget.WorkspaceFolder);
    await config.update('executable', originalExecutable, vscode.ConfigurationTarget.WorkspaceFolder);
    await config.update('configPath', originalConfigPath, vscode.ConfigurationTarget.WorkspaceFolder);
    await config.update('scanOnSave', originalScanOnSave, vscode.ConfigurationTarget.WorkspaceFolder);
  }
  assert.deepEqual(config.get<string[]>('arguments', []), originalArguments);
  assert.equal(config.get<string>('executable', 'cloudburn'), originalExecutable);
  assert.equal(config.get<string>('configPath', ''), originalConfigPath);
  assert.equal(config.get<boolean>('scanOnSave', true), originalScanOnSave);
  const restoredFindings = waitForDiagnostics(yaml, () => costFindings(yaml).length === 1);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  await restoredFindings;
  assert.equal(costFindings(yaml).length, 1, 'The real CLI arguments and workspace settings must be restored.');

  const renamed = vscode.Uri.file(join(folder.uri.fsPath, 'renamed.yaml'));
  const renamedFindings = waitForDiagnostics(renamed, () => costFindings(renamed).length === 1);
  const rename = new vscode.WorkspaceEdit();
  rename.renameFile(yaml, renamed);
  await vscode.workspace.applyEdit(rename);
  await renamedFindings;
  assert.equal(costFindings(yaml).length, 0, 'Renamed files must not leave findings at their old URI.');
  assert.equal(costFindings(siblingFile).length, 1, 'Renaming must preserve sibling diagnostics.');
  console.log('PASS: renaming refreshes findings even when scan-on-save is disabled');

  const deleted = waitForDiagnostics(renamed, () => costFindings(renamed).length === 0);
  const deletion = new vscode.WorkspaceEdit();
  deletion.deleteFile(renamed);
  await vscode.workspace.applyEdit(deletion);
  await deleted;
  assert.equal(costFindings(siblingFile).length, 1, 'Deleting a file must preserve sibling diagnostics.');
  console.log('PASS: deleted files do not retain stale cost findings');

  const nested = vscode.Uri.file(join(folder.uri.fsPath, 'nested'));
  await mkdir(nested.fsPath);
  const nestedFile = vscode.Uri.file(join(nested.fsPath, 'main.tf'));
  await writeFile(
    nestedFile.fsPath,
    'resource "aws_ebs_volume" "nested" {\n  availability_zone = "us-east-1a"\n  size = 8\n  type = "gp2"\n}\n',
  );
  const added = new Promise<void>((accept) => {
    const listener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      if (!event.added.some((item) => item.uri.toString() === nested.toString())) return;
      listener.dispose();
      accept();
    });
  });
  assert.ok(
    vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: nested }),
  );
  await added;
  const nestedConfig = vscode.workspace.getConfiguration('cloudburn', nested);
  await nestedConfig.update('executable', process.env.CLOUDBURN_TEST_NODE, vscode.ConfigurationTarget.WorkspaceFolder);
  await nestedConfig.update('arguments', [process.env.CLOUDBURN_TEST_CLI], vscode.ConfigurationTarget.WorkspaceFolder);
  await nestedConfig.update('scanOnSave', false, vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update('scanOnSave', true, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(nestedFile).length, 1, 'Overlapping roots must publish each finding only once.');
  const nestedDocument = await vscode.workspace.openTextDocument(nestedFile);
  await replaceAndSave(nestedDocument, nestedDocument.getText().replace('gp2', 'gp3'), 0);
  assert.equal(
    costFindings(siblingFile).length,
    1,
    'Saving inside an overlapping root must preserve sibling findings.',
  );
  console.log('PASS: overlapping workspace roots share findings and refresh through their outer scan settings');

  const externalPolicyPath = join(dirname(folder.uri.fsPath), 'external-policy.yml');
  await writeFile(externalPolicyPath, 'iac:\n  enabled-rules: [CLDBRN-AWS-EBS-1]\n');
  await siblingConfig.update('configPath', externalPolicyPath, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(siblingFile).length, 1, 'The external policy must select the sibling finding.');
  const missingPolicy = waitForDiagnostics(sibling, () =>
    vscode.languages
      .getDiagnostics(sibling)
      .some((item) => item.code === 'scan-failed' && item.message.includes('config file not found')),
  );
  const renamePolicy = new vscode.WorkspaceEdit();
  renamePolicy.renameFile(vscode.Uri.file(externalPolicyPath), vscode.Uri.file(`${externalPolicyPath}.old`));
  await vscode.workspace.applyEdit(renamePolicy);
  await missingPolicy;
  assert.equal(costFindings(siblingFile).length, 0, 'A renamed config must not leave findings from the old policy.');
  console.log('PASS: renaming an external config refreshes the folder that references it');

  const aliasTargetPath = join(dirname(folder.uri.fsPath), 'alias-target-policy.yml');
  const aliasPath = join(dirname(folder.uri.fsPath), 'alias-policy.yml');
  await writeFile(aliasTargetPath, 'iac:\n  enabled-rules: [CLDBRN-AWS-EBS-1]\n');
  await symlink(aliasTargetPath, aliasPath, 'file');
  await siblingConfig.update('configPath', aliasPath, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.commands.executeCommand('cloudburn.scanWorkspace');
  assert.equal(costFindings(siblingFile).length, 1, 'The aliased policy must select the sibling finding.');
  const missingTarget = waitForDiagnostics(sibling, () =>
    vscode.languages
      .getDiagnostics(sibling)
      .some((item) => item.code === 'scan-failed' && item.message.includes('config file not found')),
  );
  const renameTarget = new vscode.WorkspaceEdit();
  renameTarget.renameFile(vscode.Uri.file(aliasTargetPath), vscode.Uri.file(`${aliasTargetPath}.old`));
  await vscode.workspace.applyEdit(renameTarget);
  await missingTarget;
  assert.equal(costFindings(siblingFile).length, 0, 'A renamed alias target must not leave findings from its policy.');
  await siblingConfig.update('configPath', '', vscode.ConfigurationTarget.WorkspaceFolder);
  console.log('PASS: renaming a symlinked config target refreshes the folder that references its alias');
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
