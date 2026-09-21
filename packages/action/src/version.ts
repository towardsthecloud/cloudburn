// Versions are baked in at build time by tsup so the bundled action can report
// exactly which engine shipped inside dist/index.js.
declare const __ACTION_VERSION__: string;
declare const __SDK_VERSION__: string;
declare const __RULES_VERSION__: string;

export const ACTION_VERSION = __ACTION_VERSION__;
export const SDK_VERSION = __SDK_VERSION__;
export const RULES_VERSION = __RULES_VERSION__;
