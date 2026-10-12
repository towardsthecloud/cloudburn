import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ScanResult } from '@cloudburn/sdk';
import * as vscode from 'vscode';
import { scanFolder } from './scan.js';

const fileIdentity = async (path: string): Promise<string | undefined> => {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
};

const containsPath = (folder: string, file: string): boolean => {
  const path = relative(folder, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

const projectFindings = (folder: vscode.WorkspaceFolder, result: ScanResult): [vscode.Uri, vscode.Diagnostic[]][] => {
  const entries = new Map<string, vscode.Diagnostic[]>();
  for (const provider of result.providers) {
    for (const rule of provider.rules) {
      for (const finding of rule.findings) {
        const location = finding.location;
        const file = location ? resolve(folder.uri.fsPath, location.path) : folder.uri.fsPath;
        if (location && !containsPath(folder.uri.fsPath, file)) continue;
        const range = location
          ? new vscode.Range(
              location.line - 1,
              location.column - 1,
              (location.endLine ?? location.line) - 1,
              (location.endColumn ?? location.column) - 1,
            )
          : new vscode.Range(0, 0, 0, 0);
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

  const scanFolders = (): vscode.WorkspaceFolder[] => {
    const folders = vscode.workspace.workspaceFolders?.filter((folder) => folder.uri.scheme === 'file') ?? [];
    return folders.filter(
      (folder) => !folders.some((parent) => parent !== folder && containsPath(parent.uri.fsPath, folder.uri.fsPath)),
    );
  };

  const folderForScan = (uri: vscode.Uri): vscode.WorkspaceFolder | undefined =>
    uri.scheme === 'file' ? scanFolders().find((folder) => containsPath(folder.uri.fsPath, uri.fsPath)) : undefined;

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
    state.timerReason = undefined;
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
      if (coverage.length) {
        const folderEntry = state.entries.find(([uri]) => uri.toString() === folder.uri.toString());
        if (folderEntry) folderEntry[1].push(...coverage);
        else state.entries.push([folder.uri, coverage]);
      }
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

  const schedule = (folder: vscode.WorkspaceFolder, reason: 'save' | 'mandatory'): void => {
    if (disposed || !vscode.workspace.isTrusted || folder.uri.scheme !== 'file') return;
    const state = stateFor(folder);
    if (state.timer && state.timerReason === 'mandatory' && reason === 'save') return;
    invalidate(state);
    state.timerReason = reason;
    state.timer = setTimeout(() => {
      void scan(folder);
    }, 400);
    refresh();
  };

  const refreshFiles = (removed: readonly vscode.Uri[], added: readonly vscode.Uri[] = []): void => {
    const affected = new Map<string, vscode.WorkspaceFolder>();
    for (const uri of [...removed, ...added]) {
      const folder = folderForScan(uri);
      if (folder) affected.set(folder.uri.toString(), folder);
    }
    for (const [key, folder] of affected) {
      const state = states.get(key);
      if (!state) continue;
      invalidate(state);
      state.entries = state.entries.filter(
        ([uri]) =>
          !removed.some((file) => uri.toString() === file.toString() || uri.fsPath.startsWith(`${file.fsPath}${sep}`)),
      );
      state.findingCount = state.entries.reduce(
        (total, [, items]) => total + items.filter((item) => typeof item.code === 'object').length,
        0,
      );
      schedule(folder, 'mandatory');
    }
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
      const folders = scanFolders();
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
      if (document.uri.scheme !== 'file') return;
      const supportedFile = /\.(tf|json|ya?ml)$/i.test(document.uri.fsPath);
      const savedPath = resolve(document.uri.fsPath);
      const scheduled = new Set<string>();
      const candidates = scanFolders().map((folder) => {
        const config = vscode.workspace.getConfiguration('cloudburn', folder.uri);
        const configPath = config.get<string>('configPath', '');
        return {
          folder,
          configPath,
          configFile: configPath ? resolve(folder.uri.fsPath, configPath) : undefined,
          scanOnSave: config.get<boolean>('scanOnSave', true),
        };
      });
      const scheduleOnce = (folder: vscode.WorkspaceFolder): void => {
        const key = folder.uri.toString();
        if (scheduled.has(key)) return;
        scheduled.add(key);
        schedule(folder, 'save');
      };
      for (const candidate of candidates) {
        if (
          candidate.scanOnSave &&
          ((supportedFile && containsPath(candidate.folder.uri.fsPath, document.uri.fsPath)) ||
            candidate.configFile === savedPath)
        )
          scheduleOnce(candidate.folder);
      }
      const aliases = candidates.filter(
        (candidate) => candidate.scanOnSave && candidate.configFile && candidate.configFile !== savedPath,
      );
      if (!aliases.length) return;
      void (async () => {
        const savedIdentity = await fileIdentity(savedPath);
        if (!savedIdentity) return;
        const identities = await Promise.all(
          aliases.map(async (candidate) => ({
            candidate,
            identity: candidate.configFile ? await fileIdentity(candidate.configFile) : undefined,
          })),
        );
        for (const { candidate, identity } of identities) {
          if (!identity || identity !== savedIdentity) continue;
          const folder = scanFolders().find((current) => current.uri.toString() === candidate.folder.uri.toString());
          if (!folder) continue;
          const config = vscode.workspace.getConfiguration('cloudburn', folder.uri);
          if (config.get<string>('configPath', '') !== candidate.configPath || !config.get<boolean>('scanOnSave', true))
            continue;
          scheduleOnce(folder);
        }
      })();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      for (const folder of scanFolders()) {
        if (!event.affectsConfiguration('cloudburn', folder.uri)) continue;
        const state = states.get(folder.uri.toString());
        if (!state) continue;
        if (
          ['executable', 'arguments', 'configPath'].some((key) =>
            event.affectsConfiguration(`cloudburn.${key}`, folder.uri),
          )
        ) {
          void scan(folder);
        } else if (
          state.timer &&
          state.timerReason === 'save' &&
          !vscode.workspace.getConfiguration('cloudburn', folder.uri).get<boolean>('scanOnSave', true)
        ) {
          invalidate(state);
        }
      }
      refresh();
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      refreshFiles(event.files);
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      refreshFiles(
        event.files.map((file) => file.oldUri),
        event.files.map((file) => file.newUri),
      );
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const previous = [...states.keys()].map((key) => vscode.Uri.parse(key));
      const folders = scanFolders();
      for (const [key, state] of states) {
        if (folders.some((folder) => folder.uri.toString() === key)) continue;
        invalidate(state);
        states.delete(key);
      }
      for (const folder of folders) {
        if (
          !states.has(folder.uri.toString()) &&
          previous.some(
            (uri) => containsPath(uri.fsPath, folder.uri.fsPath) || containsPath(folder.uri.fsPath, uri.fsPath),
          )
        ) {
          schedule(folder, 'mandatory');
        }
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
  timerReason?: 'save' | 'mandatory';
};
