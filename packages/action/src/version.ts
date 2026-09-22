// Versions are baked in at build time by tsup so the bundled action can report
// exactly which engine shipped inside dist/index.cjs.
declare const __ACTION_VERSION__: string;
declare const __SDK_VERSION__: string;
declare const __RULES_VERSION__: string;

/** Version of the GitHub Action distribution, embedded by the bundle build. */
export const ACTION_VERSION = __ACTION_VERSION__;
/** Version of the SDK bundled into this action. */
export const SDK_VERSION = __SDK_VERSION__;
/** Version of the rule package bundled into this action through the SDK. */
export const RULES_VERSION = __RULES_VERSION__;
