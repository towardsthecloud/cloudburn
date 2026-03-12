import { Command, type Help, type HelpConfiguration, type HelpContext, type Option } from 'commander';

type HelpItem = {
  description: string;
  term: string;
};

type HelpScenario = 'error' | 'explicit' | 'incomplete';

type CloudBurnHelp = Help & {
  _cloudburnIsErrorOutput?: boolean;
};

type CommandWithHelpMetadata = Command & {
  _cloudburnExamples?: string[];
  _cloudburnPendingHelpScenario?: HelpScenario;
  _cloudburnRenderingHelpScenario?: HelpScenario;
  _cloudburnUsageGuidance?: string;
};

const ITEM_INDENT = 2;
const SPACER_WIDTH = 2;

const INCOMPLETE_HELP_ERROR_CODES = new Set([
  'commander.missingArgument',
  'commander.missingMandatoryOptionValue',
  'commander.optionMissingArgument',
]);

const buildCommandPath = (command: Command): string => {
  const names: string[] = [];
  let current: Command | null = command;

  while (current !== null) {
    names.unshift(current.name());
    current = current.parent;
  }

  return names.join(' ');
};

const visibleCommands = (command: Command): Command[] =>
  command.commands.filter((subcommand) => !(subcommand as Command & { _hidden?: boolean })._hidden);

const getCommandExamples = (command: Command): string[] => {
  const { _cloudburnExamples } = command as CommandWithHelpMetadata;

  return _cloudburnExamples ?? [];
};

const getCommandUsageGuidance = (command: Command): string | null => {
  const { _cloudburnUsageGuidance } = command as CommandWithHelpMetadata;

  return _cloudburnUsageGuidance ?? null;
};

const getHelpScenario = (command: Command): HelpScenario =>
  (command as CommandWithHelpMetadata)._cloudburnRenderingHelpScenario ?? 'explicit';

const inferHelpScenario = (errorCode?: string): HelpScenario =>
  errorCode !== undefined && INCOMPLETE_HELP_ERROR_CODES.has(errorCode) ? 'incomplete' : 'error';

const buildSubcommandGuidance = (command: Command): string | null => {
  const firstSubcommand = visibleCommands(command).at(0);

  if (firstSubcommand === undefined) {
    return null;
  }

  return `Specify one of the available subcommands to continue.\nTry: ${buildCommandPath(command)} ${firstSubcommand.name()}`;
};

const buildExampleGuidance = (command: Command): string | null => {
  const [firstExample] = getCommandExamples(command);

  return firstExample === undefined ? null : `Try: ${firstExample}`;
};

const buildRecoveryGuidance = (command: Command, scenario: HelpScenario): string | null => {
  if (scenario !== 'incomplete') {
    return null;
  }

  return buildSubcommandGuidance(command) ?? buildExampleGuidance(command);
};

const formatDescriptionItem = (term: string, description: string, termWidth: number, helper: Help): string => {
  const itemIndent = ' '.repeat(ITEM_INDENT);

  if (!description.includes('\n')) {
    return helper.formatItem(term, termWidth, description, helper);
  }

  const paddedTerm = term.padEnd(termWidth + term.length - helper.displayWidth(term));
  const continuationIndent = `${itemIndent}${' '.repeat(termWidth)}${' '.repeat(SPACER_WIDTH)}`;
  const [firstLine, ...remainingLines] = description.split('\n');

  return [
    `${itemIndent}${paddedTerm}${' '.repeat(SPACER_WIDTH)}${firstLine}`,
    ...remainingLines.map((line) => `${continuationIndent}${line}`),
  ].join('\n');
};

const formatSection = (title: string, items: HelpItem[], termWidth: number, helper: Help): string[] => {
  if (items.length === 0) {
    return [];
  }

  return [
    helper.styleTitle(title),
    ...items.map(({ description, term }) => formatDescriptionItem(term, description, termWidth, helper)),
    '',
  ];
};

const formatExamplesSection = (examples: string[]): string[] => {
  if (examples.length === 0) {
    return [];
  }

  return ['Examples:', ...examples.map((example) => `  ${example}`), ''];
};

const formatGuidanceBlock = (guidance: string | null): string[] => {
  if (guidance === null) {
    return [];
  }

  return [...guidance.trim().split('\n'), ''];
};

const formatCloudBurnHelp: HelpConfiguration['formatHelp'] = (command, helper) => {
  const cloudBurnHelp = helper as CloudBurnHelp;
  const helpWidth = helper.helpWidth ?? 80;
  const scenario = getHelpScenario(command);
  const localOptions = helper.visibleOptions(command);
  const globalOptions = helper.visibleGlobalOptions(command);
  const commands = helper.visibleCommands(command);
  const examples = getCommandExamples(command);
  const usageGuidance = getCommandUsageGuidance(command);
  const recoveryGuidance = buildRecoveryGuidance(command, scenario);
  const termWidth = Math.max(
    helper.longestArgumentTermLength(command, helper),
    helper.longestOptionTermLength(command, helper),
    helper.longestGlobalOptionTermLength(command, helper),
    helper.longestSubcommandTermLength(command, helper),
  );
  const output: string[] = [];
  const description = helper.commandDescription(command);

  if (!cloudBurnHelp._cloudburnIsErrorOutput && description.length > 0) {
    output.push(helper.boxWrap(helper.styleCommandDescription(description), helpWidth), '');
  }

  output.push(`${helper.styleTitle('Usage:')} ${helper.styleUsage(helper.commandUsage(command))}`, '');
  output.push(...formatExamplesSection(examples));
  output.push(...formatGuidanceBlock(usageGuidance));

  output.push(
    ...formatSection(
      'Available Commands:',
      commands.map((subcommand) => ({
        description: helper.styleSubcommandDescription(helper.subcommandDescription(subcommand)),
        term: helper.styleSubcommandTerm(helper.subcommandTerm(subcommand)),
      })),
      termWidth,
      helper,
    ),
  );

  output.push(
    ...formatSection(
      'Arguments:',
      helper.visibleArguments(command).map((argument) => ({
        description: helper.styleArgumentDescription(helper.argumentDescription(argument)),
        term: helper.styleArgumentTerm(helper.argumentTerm(argument)),
      })),
      termWidth,
      helper,
    ),
  );

  output.push(
    ...formatSection(
      command.parent === null ? 'Global Flags:' : 'Flags:',
      localOptions.map((option) => ({
        description: helper.styleOptionDescription(helper.optionDescription(option)),
        term: helper.styleOptionTerm(helper.optionTerm(option)),
      })),
      termWidth,
      helper,
    ),
  );

  if (command.parent !== null) {
    output.push(
      ...formatSection(
        'Global Flags:',
        globalOptions.map((option: Option) => ({
          description: helper.styleOptionDescription(helper.optionDescription(option)),
          term: helper.styleOptionTerm(helper.optionTerm(option)),
        })),
        termWidth,
        helper,
      ),
    );
  }

  output.push(...formatGuidanceBlock(recoveryGuidance));

  if (scenario === 'error' && commands.length > 0) {
    output.push(`Use "${buildCommandPath(command)} [command] --help" for more information about a command.`, '');
  }

  while (output.at(-1) === '') {
    output.pop();
  }

  return `${output.join('\n')}\n`;
};

const prepareCloudBurnHelpContext = function (
  this: CloudBurnHelp,
  contextOptions: Parameters<Help['prepareContext']>[0],
): void {
  this._cloudburnIsErrorOutput = !!contextOptions.error;
  this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
};

class CloudBurnCommand extends Command {
  _cloudburnExamples?: string[];
  _cloudburnPendingHelpScenario?: HelpScenario;
  _cloudburnRenderingHelpScenario?: HelpScenario;
  _cloudburnUsageGuidance?: string;

  /**
   * Creates CloudBurn subcommands that inherit the scenario-aware help behavior.
   *
   * @param name - Optional subcommand name supplied by Commander.
   * @returns A new CloudBurn-aware command instance.
   */
  createCommand(name?: string): Command {
    return new CloudBurnCommand(name);
  }

  /**
   * Captures the error scenario so Commander help-after-error renders the correct layout.
   *
   * @param message - Error text emitted by Commander.
   * @param errorOptions - Commander exit metadata including the error code.
   * @returns Never returns because Commander exits or throws via exitOverride.
   */
  error(message: string, errorOptions?: { code?: string; exitCode?: number }): never {
    this._cloudburnPendingHelpScenario = inferHelpScenario(errorOptions?.code);
    return super.error(message, errorOptions);
  }

  /**
   * Returns help text using the shared CloudBurn scenario rules.
   *
   * @param context - Commander help context.
   * @returns The formatted help text.
   */
  helpInformation(context?: HelpContext): string {
    return this.renderWithHelpScenario(context, () => super.helpInformation(context));
  }

  private renderWithHelpScenario<T>(context: HelpContext | undefined, render: () => T): T {
    const previousScenario = this._cloudburnRenderingHelpScenario;
    const pendingScenario = this._cloudburnPendingHelpScenario;

    this._cloudburnRenderingHelpScenario = context?.error
      ? (pendingScenario ?? 'error')
      : (pendingScenario ?? 'explicit');
    this._cloudburnPendingHelpScenario = undefined;

    try {
      return render();
    } finally {
      this._cloudburnRenderingHelpScenario = previousScenario;
    }
  }
}

const outputScenarioHelp = (command: Command, scenario: HelpScenario): void => {
  const cloudBurnCommand = command as CommandWithHelpMetadata;
  const previousScenario = cloudBurnCommand._cloudburnPendingHelpScenario;

  cloudBurnCommand._cloudburnPendingHelpScenario = scenario;

  try {
    command.outputHelp();
  } finally {
    cloudBurnCommand._cloudburnPendingHelpScenario = previousScenario;
  }
};

/**
 * Creates the CloudBurn command root so future commands inherit the shared help behavior.
 *
 * @returns Root command instance with scenario-aware help support.
 */
export const createCliCommand = (): Command => new CloudBurnCommand();

/**
 * Shared Commander help configuration used by the CloudBurn CLI.
 *
 * This keeps the help/error layout consistent for current and future commands,
 * including inherited root flags and parent command discovery.
 *
 * @returns Commander help configuration with CloudBurn-specific formatting.
 */
export const createHelpConfiguration = (): HelpConfiguration => ({
  formatHelp: formatCloudBurnHelp,
  prepareContext: prepareCloudBurnHelpContext,
  showGlobalOptions: true,
  visibleCommands,
});

/**
 * Applies the shared CloudBurn help/error configuration to a command tree root.
 *
 * @param program - Root Commander program to configure.
 * @returns Nothing. The program is mutated in place.
 */
export const configureCliHelp = (program: Command): void => {
  program.configureHelp(createHelpConfiguration());
  program.showHelpAfterError();
  program.showSuggestionAfterError();
};

/**
 * Registers a structural parent command that prints its scoped help when invoked bare.
 *
 * Future command groups should use this helper so parent command behavior stays
 * consistent without custom per-command help wiring.
 *
 * @param parent - Command that owns the new subcommand.
 * @param name - Subcommand name.
 * @param description - User-facing summary shown in help output.
 * @returns The configured parent command for further subcommand registration.
 */
export const registerParentCommand = (parent: Command, name: string, description: string): Command =>
  parent
    .command(name)
    .description(description)
    .usage('[command]')
    .allowExcessArguments(true)
    .action(function (this: Command) {
      if (this.args.length > 0) {
        (this as Command & { unknownCommand(): never }).unknownCommand();
        return;
      }

      outputScenarioHelp(this, 'incomplete');
    });

/**
 * Registers examples that should appear as an `Examples:` section in the shared help output.
 *
 * @param command - Command whose help output should include the examples.
 * @param examples - Example invocations rendered in declaration order.
 * @returns The same command for chaining.
 */
export const setCommandExamples = (command: Command, examples: string[]): Command => {
  (command as CommandWithHelpMetadata)._cloudburnExamples = examples;
  return command;
};

/**
 * Registers usage guidance that should render directly below `Usage:` in shared help output.
 *
 * This is intended for longer instructional blocks such as shell completion setup steps.
 *
 * @param command - Command whose help output should include the usage guidance block.
 * @param guidance - Multi-line instructional text rendered in declaration order.
 * @returns The same command for chaining.
 */
export const setCommandUsageGuidance = (command: Command, guidance: string): Command => {
  (command as CommandWithHelpMetadata)._cloudburnUsageGuidance = guidance.trim();
  return command;
};
