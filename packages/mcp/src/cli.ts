import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createCloudBurnServer } from './server.js';

// stdout carries JSON-RPC; everything else goes to stderr.
const handle = serveStdio(() => createCloudBurnServer(), {
  onerror: (error) => process.stderr.write(`cloudburn-mcp: ${error.message}\n`),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void handle.close();
  });
}
