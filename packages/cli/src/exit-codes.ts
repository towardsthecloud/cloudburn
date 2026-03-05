// Intent: centralize process exit semantics for CI pipelines.
// TODO(cloudburn): map severities and runtime failures to final exit statuses.
export const EXIT_CODE_OK = 0;
export const EXIT_CODE_POLICY_VIOLATION = 1;
export const EXIT_CODE_RUNTIME_ERROR = 2;
