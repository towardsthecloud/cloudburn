# VS Code extension

`cloudburn-vscode` is a private distribution package. It runs the installed CLI over a JSON subprocess boundary;
scanning, rule selection, configuration, and suppressions remain in the CLI/SDK. SDK imports here are type-only.

- Keep subprocess launches shell-free. Executable and launcher arguments are separate settings; never download or
  install a CLI implicitly. Scans require a trusted workspace on the extension host filesystem.
- Resolve finding locations relative to the scanned folder. Ignore locations outside it, preserve sibling workspace
  results, and prevent cancelled or superseded scans from publishing diagnostics.
- Keep failed and skipped scans visible. A CLI policy exit code of 1 with valid JSON is a completed scan.
- Test editor behavior through the real VS Code host and built CLI in `test/e2e/`. Transport tests cover malformed
  responses and subprocess failures that real healthy CLI fixtures cannot reproduce.
- [README](README.md) owns setup, commands, settings, and local VSIX packaging. [Testing](../../docs/TESTING.md) owns
  the test strategy; [generated files](../../docs/reference/generated-files.md) owns bundle and license generation.
- Marketplace publication is separate from npm releases. Do not publish during feature work; see
  [releasing](../../docs/guides/releasing.md#vs-code-extension).
