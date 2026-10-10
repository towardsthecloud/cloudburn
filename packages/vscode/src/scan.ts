import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import type { ScanResult } from '@cloudburn/sdk';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const coordinate = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

const validLocation = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    typeof value.path !== 'string' ||
    !value.path ||
    !coordinate(value.line) ||
    !coordinate(value.column)
  )
    return false;
  if (value.endLine !== undefined && !coordinate(value.endLine)) return false;
  if (value.endColumn !== undefined && !coordinate(value.endColumn)) return false;
  const endLine = Number(value.endLine ?? value.line);
  const endColumn = Number(value.endColumn ?? value.column);
  return endLine > value.line || (endLine === value.line && endColumn >= value.column);
};

const isScanResult = (value: unknown): value is ScanResult => {
  if (!isRecord(value) || !Array.isArray(value.providers)) return false;
  if (value.suppressed !== undefined && !Array.isArray(value.suppressed)) return false;
  if (
    value.diagnostics !== undefined &&
    (!Array.isArray(value.diagnostics) ||
      !value.diagnostics.every(
        (item: unknown) =>
          isRecord(item) &&
          typeof item.message === 'string' &&
          typeof item.status === 'string' &&
          (item.details === undefined || typeof item.details === 'string'),
      ))
  )
    return false;
  return value.providers.every(
    (provider: unknown) =>
      isRecord(provider) &&
      ['aws', 'azure', 'gcp'].includes(String(provider.provider)) &&
      Array.isArray(provider.rules) &&
      provider.rules.every(
        (rule: unknown) =>
          isRecord(rule) &&
          typeof rule.ruleId === 'string' &&
          typeof rule.service === 'string' &&
          rule.source === 'iac' &&
          ['high', 'medium', 'low'].includes(String(rule.severity)) &&
          typeof rule.message === 'string' &&
          Array.isArray(rule.findings) &&
          rule.findings.every(
            (finding: unknown) =>
              isRecord(finding) && typeof finding.resourceId === 'string' && validLocation(finding.location),
          ),
      ),
  );
};

const errorMessage = (stderr: string, fallback: string): string => {
  try {
    const value: unknown = JSON.parse(stderr);
    if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string') return value.error.message;
  } catch {
    /* Non-CloudBurn launchers can return plain stderr. */
  }
  return stderr.trim() || fallback;
};

/** Executable and configuration for a scan in one workspace folder. */
export type ScanOptions = {
  executable: string;
  arguments: string[];
  configPath: string;
  signal: AbortSignal;
};

/**
 * Runs the CLI without a shell, preserving its workspace configuration and policy exit status.
 * @param folder - Absolute workspace folder to scan and use as the working directory.
 * @param options - CLI launcher, optional configuration, and cancellation signal.
 * @returns The machine-readable static scan result.
 */
export const scanFolder = (folder: string, options: ScanOptions): Promise<ScanResult> =>
  new Promise((accept, reject) => {
    const args = [...options.arguments, '--format', 'json', 'scan', folder];
    if (options.configPath) args.push('--config', resolve(folder, options.configPath));
    execFile(
      options.executable,
      args,
      { cwd: folder, encoding: 'utf8', signal: options.signal, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && error.code !== 1) {
          if (error.code === 'ENOENT') {
            reject(
              new Error(
                'CloudBurn CLI was not found. Install CloudBurn or set cloudburn.executable to its absolute path.',
              ),
            );
          } else {
            reject(new Error(errorMessage(stderr, error.message)));
          }
          return;
        }
        try {
          const result: unknown = JSON.parse(stdout);
          if (!isScanResult(result)) {
            reject(
              new Error('CloudBurn returned an incompatible scan result. Update the CLI and check its configuration.'),
            );
            return;
          }
          accept(result);
        } catch {
          reject(new Error('CloudBurn did not return valid JSON. Check the configured CLI executable and arguments.'));
        }
      },
    );
  });
