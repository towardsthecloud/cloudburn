import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ScanResult } from '@cloudburn/sdk';
import * as vscode from 'vscode';
import { scanFolder } from './scan.js';

const projectFindings = (folder: vscode.WorkspaceFolder, result: ScanResult): [vscode.Uri, vscode.Diagnostic[]][] => {
  const entries = new Map<string, vscode.Diagnostic[]>();
  for (const provider of result.providers) {
    for (const rule of provider.rules) {
      for (const finding of rule.findings) {
        if (!finding.location) continue;
        const { path, line, column, endLine, endColumn } = finding.location;
        const file = resolve(folder.uri.fsPath, path);
        const withinFolder = relative(folder.uri.fsPath, file);
        if (withinFolder === '..' || withinFolder.startsWith(`..${sep}`) || isAbsolute(withinFolder)) continue;
        const range = new vscode.Range(line - 1, column - 1, (endLine ?? line) - 1, (endColumn ?? column) - 1);
        const severity = rule.severity === 'high' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
        const diagnostic = new vscode.Diagnostic(range, `${rule.message} (${finding.resourceId})`, severity);
        diagnostic.source = 'CloudBurn';
        diagnostic.code = {
          value: rule.ruleId,
          target: vscode.Uri.parse(
            `https://cloudburn.io/docs/rules/${provider.provider}/${encodeURIComponent(rule.service)}#${rule.ruleId.toLowerCase()}`,
          ),
        };
        const items = entries.get(file) ?? [];
        items.push(diagnostic);
        entries.set(file, items);
      }
    }
  }
  return [...entries].map(([file, items]) => [vscode.Uri.file(file), items]);
};

/**
 * Registers CloudBurn's editor integration.
 * @param context - VS Code's extension lifecycle owner.
 * @returns Nothing.
 */
export const activate = (context: vscode.ExtensionContext): void => {
  const diagnostics = vscode.languages.createDiagnosticCollection('CloudBurn');
  const output = vscode.window.createOutputChannel('CloudBurn');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'cloudburn.showOutput';
  status.name = 'CloudBurn';
  const states = new Map<string, FolderState>();
  let disposed = false;

  const refresh = (): void => {
    diagnostics.clear();
    diagnostics.set([...states.values()].flatMap((state) => state.entries));
    const working = [...states.values()].some((state) => state.abort || state.timer);
    const incomplete = [...states.values()].some((state) => state.incomplete);
    const count = [...states.values()].reduce((total, state) => total + state.findingCount, 0);
    status.text = working
      ? '$(sync~spin) CloudBurn'
      : incomplete
        ? '$(warning) CloudBurn: incomplete'
        : `$(flame) CloudBurn: ${count}`;
    status.tooltip = working
      ? 'Scanning saved workspace files'
      : incomplete
        ? 'Some files could not be scanned. Open CloudBurn Output for details.'
        : `${count} cost finding(s). Open CloudBurn Output for details.`;
    if (states.size > 0) status.show();
    else status.hide();
  };

  const stateFor = (folder: vscode.WorkspaceFolder): FolderState => {
    const key = folder.uri.toString();
    let state = states.get(key);
    if (!state) {
      state = { revision: 0, entries: [], findingCount: 0, incomplete: false };
      states.set(key, state);
    }
    return state;
  };

  const invalidate = (state: FolderState): void => {
    state.revision += 1;
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    state.abort?.abort();
    state.abort = undefined;
  };

  const scan = async (folder: vscode.WorkspaceFolder): Promise<void> => {
    if (disposed || !vscode.workspace.isTrusted || folder.uri.scheme !== 'file') return;
    const state = stateFor(folder);
    invalidate(state);
    const revision = state.revision;
    const abort = new AbortController();
    state.abort = abort;
    refresh();
    const config = vscode.workspace.getConfiguration('cloudburn', folder.uri);
    try {
      const result = await scanFolder(folder.uri.fsPath, {
        executable: config.get<string>('executable', 'cloudburn'),
        arguments: config.get<string[]>('arguments', []),
        configPath: config.get<string>('configPath', ''),
        signal: abort.signal,
      });
      if (disposed || revision !== state.revision) return;
      state.entries = projectFindings(folder, result);
      state.findingCount = result.providers.reduce(
        (total, provider) => total + provider.rules.reduce((sum, rule) => sum + rule.findings.length, 0),
        0,
      );
      state.incomplete = Boolean(result.diagnostics?.length);
      output.appendLine(
        `${folder.name}: ${state.findingCount} cost finding(s), ${result.suppressed?.length ?? 0} suppressed.`,
      );
      for (const provider of result.providers) {
        for (const rule of provider.rules) {
          for (const finding of rule.findings)
            output.appendLine(`${rule.ruleId} ${finding.location?.path ?? finding.resourceId}: ${rule.message}`);
        }
      }
      const coverage = (result.diagnostics ?? []).map((item) => {
        output.appendLine(`${item.status}: ${item.message}${item.details ? ` ${item.details}` : ''}`);
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          item.message,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'CloudBurn';
        diagnostic.code = item.code ?? 'incomplete-scan';
        return diagnostic;
      });
      if (coverage.length) state.entries.push([folder.uri, coverage]);
    } catch (error) {
      if (disposed || revision !== state.revision || abort.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`${folder.name}: scan failed. ${message}`);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        `CloudBurn scan failed: ${message}`,
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = 'CloudBurn';
      diagnostic.code = 'scan-failed';
      state.entries = [[folder.uri, [diagnostic]]];
      state.findingCount = 0;
      state.incomplete = true;
    } finally {
      if (!disposed && revision === state.revision) {
        state.abort = undefined;
        refresh();
      }
    }
  };

  const schedule = (folder: vscode.WorkspaceFolder): void => {
    if (disposed || !vscode.workspace.isTrusted || folder.uri.scheme !== 'file') return;
    if (!vscode.workspace.getConfiguration('cloudburn', folder.uri).get<boolean>('scanOnSave', true)) return;
    const state = stateFor(folder);
    invalidate(state);
    state.timer = setTimeout(() => {
      void scan(folder);
    }, 400);
    refresh();
  };

  context.subscriptions.push(
    diagnostics,
    output,
    status,
    {
      dispose: () => {
        disposed = true;
        for (const state of states.values()) invalidate(state);
        states.clear();
      },
    },
    vscode.commands.registerCommand('cloudburn.scanWorkspace', async () => {
      const folders = vscode.workspace.workspaceFolders?.filter((folder) => folder.uri.scheme === 'file') ?? [];
      if (!folders.length) {
        await vscode.window.showInformationMessage('Open a local workspace folder to scan with CloudBurn.');
        return;
      }
      await Promise.all(folders.map(scan));
    }),
    vscode.commands.registerCommand('cloudburn.showOutput', () => output.show()),
    vscode.commands.registerCommand('cloudburn.openCiGuide', () =>
      vscode.env.openExternal(vscode.Uri.parse('https://cloudburn.io/docs/cli/github-action')),
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== 'file' || !/\.(tf|tf\.json|json|ya?ml)$/i.test(document.uri.fsPath)) return;
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (folder) schedule(folder);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        if (!event.affectsConfiguration('cloudburn', folder.uri)) continue;
        const state = states.get(folder.uri.toString());
        if (state) {
          invalidate(state);
          state.entries = [];
          state.incomplete = false;
          state.findingCount = 0;
        }
      }
      refresh();
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      for (const [key, state] of states) {
        if (!event.files.some((file) => vscode.workspace.getWorkspaceFolder(file)?.uri.toString() === key)) continue;
        invalidate(state);
        state.entries = state.entries.filter(
          ([uri]) =>
            !event.files.some(
              (deleted) => uri.toString() === deleted.toString() || uri.fsPath.startsWith(`${deleted.fsPath}${sep}`),
            ),
        );
        state.findingCount = state.entries.reduce(
          (total, [, items]) => total + items.filter((item) => typeof item.code === 'object').length,
          0,
        );
      }
      for (const file of event.files) {
        const folder = vscode.workspace.getWorkspaceFolder(file);
        if (folder) schedule(folder);
      }
      refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      for (const folder of event.removed) {
        const state = states.get(folder.uri.toString());
        if (state) invalidate(state);
        states.delete(folder.uri.toString());
      }
      refresh();
    }),
  );
};

type FolderState = {
  revision: number;
  entries: [vscode.Uri, vscode.Diagnostic[]][];
  findingCount: number;
  incomplete: boolean;
  abort?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
};
