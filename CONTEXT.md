# CONTEXT

> Ubiquitous language for `claude-profile`. Use these terms in code,
> tests, and conversations. Avoid synonyms unless explicitly added here.

## Glossary

### Profile
A named bundle of API credentials and configuration that the user can
"switch into." Persisted as `<config-dir>/<name>.json`. Owned by the
`Profile` type and the `ProfileService` interface.

### Profile Service
The seam that abstracts profile persistence. `ProfileService` is the
interface; `ProfileServiceImpl` is the default in-memory + filesystem
adapter; `InMemoryConfigStore` and `FileSystemConfigStore` are the two
storage adapters. **All commands depend on `ProfileService`, never on a
specific store or the `profileService` singleton directly.**

### Config Store
The lower-level seam below `ProfileService`. Owns raw read/write of
profile files and the `.current`/`.current-prev` markers. Two adapters
exist: filesystem (production) and in-memory (tests).

### Command Context
The dependency bundle every command receives as its first argument.
Carries `profiles` (ProfileService), `env` (EnvPresenter), `prompts`
(Prompts interface), and `isTTY` (boolean). **Replaces the legacy
module-level singletons.** A `CommandContext` is the test surface for
every command.

### Prompts
The interactive-UI seam. A `Prompts` object exposes every inquirer
function a command might need (`selectProvider`, `inputApiToken`,
`confirmAction`, etc.). `realPrompts` is the inquirer-backed
implementation; `noopPrompts` is the test default (returns empty
strings / nulls / false).

### Env Presenter
The human-facing output formatter. Owns every `format*` method that
produces colored, banner-style text for the terminal. `envPresenter`
singleton exists for back-compat; new code should use
`ctx.env.format*`.

### Env Diff
Pure-data env transformation. Lives in `engine/envDiff.ts` and produces
JSON (`{ set, unset }`) or shell `export`/`unset` lines. **Has no I/O
and no dependency on the presenter or service.** Audience is the
shell-hook's `safe_eval` bridge, not a human.

### Provider Template
A built-in preset (`minimax`, `kimi`, `aliyun`, `volcano`, `xunfei`,
`xiaomi`, `zai`, `custom`) that pre-fills the `base URL`, default
model, and model-slot values for a known API. `materializeProfile`
turns a template + user-supplied credentials into a complete `Profile`.

### Shell Hook
The bash script emitted by `claude-profile init` and `eval`'d at
shell-startup. Registers a `claude-profile` shell function that
intercepts `switch` and feeds the result through `_claude_profile_safe_eval`
to inject `export KEY=…` lines into the current shell.

### Eval Bridge
The contract between the CLI's stdout and the user's shell. The CLI
emits plain `export KEY='value';` / `unset KEY;` lines; the shell
function's `safe_eval` reads them, validates each against a strict
regex, and `eval`s the survivors. Anything not matching the regex is
dropped with a warning. **This is the security boundary for shell
injection.**

### Default Env Baseline
The set of cross-provider env defaults (effort, timeout, BUG workarounds)
injected by `init` via `renderDefaultEnvBlock`. Guarded by
`CLAUDE_PROFILE_DEFAULT_ENV=0` to disable.

### Activation
The act of setting a profile as the "current" one and emitting the env
diff for the shell to apply. Encoded by `engine/activation.ts` and
`commands/switch.ts`. Side effect: updates the `.current` marker on
disk; primary effect: produces the eval-bridge output.

### Command
A pure function in `src/commands/*.ts` that takes a `CommandContext`
plus an input DTO and returns a `CommandResult` (a discriminated
union of success-with-output or failure-with-error). **Commands are
the only public verbs the bin file or an embedder invokes.**

### Interactive Command
A `*Interactive` variant of a command that uses `ctx.prompts` to gather
its input from the user via inquirer. The non-interactive variant is
the same command with a programmatic input DTO.

## Vocabulary discipline

- Say **"Profile"**, not "config file" or "preset" or "account."
- Say **"CommandContext"**, not "the context object" or "the deps."
- Say **"eval bridge"** or **"shell hook"**, not "the magic script."
- Say **"materialize"** when going from `ProviderTemplate + credentials`
  to a complete `Profile`.
- Say **"Provider Template"**, not "provider" alone (a `Provider` is
  an upstream service; a `ProviderTemplate` is a preset for one).
