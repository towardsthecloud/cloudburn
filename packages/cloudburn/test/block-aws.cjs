// Offline commands must not load AWS clients or credential providers in either module format.
const { registerHooks } = require('node:module');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@aws-sdk/') || specifier.startsWith('@smithy/')) {
      throw new Error(`Offline command loaded an AWS dependency: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
});
