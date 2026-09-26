// tsup bakes the package version into the build so the server reports exactly which release is running.
declare const __VERSION__: string;

/** Version of the published `@cloudburn/mcp` package, embedded by the build. */
export const SERVER_VERSION = __VERSION__;
