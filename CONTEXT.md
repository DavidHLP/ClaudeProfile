# CONTEXT

> Ubiquitous language for `claude-profile`. Use these terms in code,
> tests, and conversations. Avoid synonyms unless explicitly added here.

## Glossary

### Profile
A named bundle of API credentials and configuration that the user can
"switch into." Persisted as `<config-dir>/<name>.json`. Owned by the
`Profile` type and the `ProfileService` interface.

### Profile Field
One of the 5 first-class keys a profile exposes to the user:
`baseUrl`, `token`, `sonnetModel`, `opusModel`, `haikuModel`. The
canonical union lives in `domain/profileSchema.ts` as `ProfileField`.
The legacy `EditableField` type in `types/command.ts` is a back-compat
alias for `ProfileField`.

### Profile Field Prompt
The schema-backed single entry point for collecting a `ProfileField`
at the prompt layer. Exposed as `ctx.prompts.inputProfileField(field,
options?)` on the `Prompts` interface. Owns: the per-field label
(`FieldSpec.label`) and the input-time validator
(`FieldSpec.validateInput`). Replaces the 5 hand-rolled
`inputApiToken` / `inputBaseUrl` / `inputSonnetModel` / `inputOpusModel`
/ `inputHaikuModel` methods on the interactive create/edit paths. The
companion `defaultFieldValue(env, field, fallback)` schema helper is
the canonical way to compute "what's the default for field X given a
base env (e.g. a provider's `envTemplate`)?". **Interactive commands
that collect a profile field go through this seam; the per-field
prompt methods exist for back-compat only.**

### Profile Schema
The canonical shape of a profile's first-class fields. Lives in
`domain/profileSchema.ts`. Owns: the `PROFILE_FIELDS` map (env keys,
label, required flag, sensitive flag, prompt-time validator per
field), the `PROFILE_DISPLAY_ROWS` list (the 6-row detail panel),
and the pure functions `applyField`, `getFieldValue`, `validateProfile`,
`profileDetailRows`, `maskProfileValue`. **All commands and
presenters go through the schema; the "5-field shape" is never
duplicated outside it.**

### Effective Field Value
The "first non-empty env key" read for a field, used by the display
path. Distinct from `getFieldValue` (primary-only, used by write /
validate paths): when the primary env key is empty but a legacy env
key has a value (e.g. an older profile where only `ANTHROPIC_MODEL`
is set and the new `ANTHROPIC_DEFAULT_SONNET_MODEL` is empty),
`getEffectiveFieldValue` returns the legacy value while
`getFieldValue` returns `undefined`. Lives in
`domain/profileSchema.ts` as a pure function.

### Profile Field Display
The schema-backed "what string do I show next to this field's
label?" function. Exposed as
`formatFieldDisplayValue(env, field, options?)` on the schema.
Owns: the per-field display policy (token → `[*****]` / `[UNSET]`
marker, others → effective value or `(未设置)`), and the
`FieldDisplayOptions` seam that lets callers pick the visual
variant (e.g. padded `[ ***** ]` / `[ UNSET ]` for the
profile-list table) without forcing the schema to know about
padding or ANSI dimming. Replaces the 5-case
`ui/prompt.ts#describeFieldValue` switch, the inline
`p.env.ANTHROPIC_AUTH_TOKEN ? '[*****]' : '[UNSET]'` in
`selectProfileFromList`, and the inline
`profile.env.ANTHROPIC_AUTH_TOKEN ? theme.dim('[ ***** ]') :
theme.dim('[ UNSET ]')` in `formatProfileList`. The companion
read function is `getEffectiveFieldValue` (display-side, primary
plus legacy fallback). **Any code that needs to render a field's
current value as a string goes through this seam.**

### Verbose Report
The "where am I looking" header (`详细信息:` / `配置目录: …` /
`当前配置: …` / `配置数量: …`) that `listCommand --verbose` and
`validateCommand --verbose` emit before the per-profile detail
blocks. Owned by `EnvPresenter.formatVerboseHeader` (ADR-0005). The
caller supplies the data (`storeLocation`, `currentProfile`,
`profileCount`) and the surrounding whitespace context; the seam
stays neutral. **Any command that wants the 5-line header goes
through this seam; the array literal is never re-constructed in
the command layer.**

### Issue Block
The "❌ 发现 N 个错误 / ⚠️ 发现 N 个警告" block that
`validateCommand` emits when at least one profile fails validation.
Owned by `EnvPresenter.formatValidationIssues` (ADR-0005). The seam
accepts the display-shaped issue (`{ profile, envKey, message,
severity }`) — the command's `{ ...issue, profile: profile.name }`
adapter is the single place where the schema's profile-free
`ValidationIssue` meets the presenter's display shape. Returns
`''` when the input is empty so callers don't have to guard.

### Profile Field → Env Key Mapping
A field may own one or two env keys. The SONNET field owns both
`ANTHROPIC_DEFAULT_SONNET_MODEL` (the slot override, primary) and
the legacy `ANTHROPIC_MODEL`. `applyField` writes to every env key
the field owns; `getFieldValue` reads the primary. Other fields
own a single env key (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`,
`ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`).

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
The interactive-UI seam. A `Prompts` object exposes 9 inquirer-backed
methods a command might need (`selectProvider`, `inputProfileField`,
`selectProfileFromList`, `confirmAction`, etc.). `realPrompts` is
the inquirer-backed implementation; `noopPrompts` is the test
default (returns empty strings / nulls / false).

The 5 legacy per-field prompt functions (`inputApiToken`,
`inputBaseUrl`, `inputSonnetModel`, `inputOpusModel`,
`inputHaikuModel`) live as top-level exports of `ui/prompt.ts` for
embedder back-compat; they are not on the `Prompts` interface. New
code uses `inputProfileField` (ADR-0003) or imports the top-level
function directly (ADR-0009).

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

### Interactive Session
The "select a profile, build the input, optionally confirm, then
execute" shape shared by most `*Interactive` commands. Lives in
`commands/interactiveSession.ts` as the `runProfileAction` higher-order
function and a `ProfileActionFlow` descriptor. **Every `*Interactive`
command that operates on a profile should compose this flow rather
than re-implementing the list/empty/select/confirm/return-cancelled
sequence by hand.** The session understands one cancellation
primitive — `CancelledError` — and converts it to a uniform
`{ success: false, wasCancelled: true }` result; `runner.toCommandResult`
honors the same primitive so `runCommand`-wrapped code can throw it
without losing the `wasCancelled` flag.


### BackupStore
The port for backup and restore of the config directory. Owns
`create(sourceDir, outputPath?)`, `extract(archivePath, targetDir)`,
`list()`, `getBackupDir()`, and `generateBackupName()`. Two adapters
ship: `FileSystemBackupStore` (prod, tar-based) and
`InMemoryBackupStore` (tests). The security checks
(path-traversal, symlink rejection) live at the port boundary, where
the hostile archive crosses into our process. `ctx.backup` is the
5th field of `CommandContext`. The production singleton is
`backupStore`; tests inject `InMemoryBackupStore` via
`createTestContext({ backup: ... })`. **All backup and restore
code goes through this seam; tar-specific knowledge is never
duplicated outside `FileSystemBackupStore`.**

### Diagnostic
The canonical diagnostic-report shape for `claude-profile doctor`.
Lives in `domain/diagnostic.ts` and owns: the `CheckStatus` union
(`'ok' | 'warning' | 'error'`), the `CheckResult` interface, the 7
named check functions (config dir, profile files, profile security,
current profile, shell hook, git repo, env consistency), and the
`runDiagnostics(ctx): CheckResult[]` runner. The report shape is
owned by `EnvPresenter.formatDiagnosticReport` — the command layer
never inlines the per-check line format or the summary line. The
deletion test: remove the diagnostic module and the 7 check
functions reappear in `doctorCommand` within 20 lines.

### Env Diff Primitive
The `diffEnvs(oldEnv, newEnv): { set, unset }` function in
`engine/envDiff.ts` that is the single source of truth for the
"diff two envs" computation. All 4 wire-format builders
(`buildExportJson`, `buildSwitchJson`, `buildExportCommands`,
`buildSwitchCommands`) are 1-line adapters that consume the
primitive. Three formatters (`formatEnvJson`, `formatExportShell`,
`formatSwitchShell`) are exported for callers that already have a
diff in hand. **All env diffs go through this primitive; the
`oldKeys`/`newKeys` iteration is never duplicated outside
`diffEnvs`.**

### Interactive Selection Flow
The "select from a list, build input, optionally confirm, then
execute" shape shared by all `*Interactive` commands. Lives in
`commands/interactiveSession.ts` as the `runSelectableAction`
higher-order function and a `SelectableActionFlow` descriptor. The
profile-specific alias `runProfileAction` is the thin back-compat
form for the 7 commands that select profiles; the
`restoreCommandInteractive` flow uses `runSelectableAction` with
`TSelected = string` (the backup path). The selection UI itself
stays in `Prompts` (`selectProfileFromList`) for the profile flow;
non-profile flows render an inquirer list inline. **Every
`*Interactive` command that selects from a list composes this
flow; the list/empty/select/confirm/return-cancelled sequence is
never re-implemented by hand.**

### Status Report
The multi-section status block that `statusCommand` emits: a
"当前状态" header, a 3-line context block (current profile / config
dir / profile count), and a "Shell 环境变量 (注入来源)" block listing
the Claude env keys currently in the shell. Owned by
`EnvPresenter.formatStatus` (ADR-0010). The caller supplies
`currentProfile`, `storeLocation`, `profileCount`, the
pre-filtered `shellEnv` from `domain/shellEnv.ts`, and the
`maskValue` function. The seam trusts the filter and the masking
policy; it just renders. **The status block is never constructed
inline in the command layer.**

### Claude Env Key Prefix Set
The canonical list of env-key prefixes that identify a "Claude env
key" — an env var that `claude-profile` knows how to inject via
the eval-bridge or that a Claude-related tool (Claude Code, etc.)
reads. Exported as `CLAUDE_ENV_KEY_PREFIXES` from
`domain/shellEnv.ts` as `['CLAUDE_CODE_', 'ANTHROPIC_']`. The
order is longer-prefix-first so that future logic that walks the
prefixes in order can rely on the most specific match winning.
**The "is this a Claude env key?" question has exactly one
answer; no command inlines the prefix list.**

### Shell Env Extraction
The pure `extractClaudeShellEnv(processEnv, prefixes?): Record<string, string>`
function in `domain/shellEnv.ts` that filters a `process.env`-shaped
bag down to the Claude-relevant subset. POSIX-invalid keys are
silently dropped; empty / undefined values are dropped;
whitespace-only values are kept (the shell is the source of
truth). **The `startsWith('ANTHROPIC_')` / `startsWith('CLAUDE_CODE_')`
iteration is never duplicated outside `extractClaudeShellEnv`.**

## Vocabulary discipline

- Say **"Profile"**, not "config file" or "preset" or "account."
- Say **"CommandContext"**, not "the context object" or "the deps."
- Say **"eval bridge"** or **"shell hook"**, not "the magic script."
- Say **"materialize"** when going from `ProviderTemplate + credentials`
  to a complete `Profile`.
- Say **"Profile Field"** (one of the 5 first-class fields), not
  "env key" or "config field" — `EnvConfig` is a flat dict and not
  every env key is a field.
- Say **"apply"** (`applyField`) when writing a field's value into an
  env, and **"validate"** (`validateProfile`) when checking an env
  for issues.
- Say **"Provider Template"**, not "provider" alone (a `Provider` is
  an upstream service; a `ProviderTemplate` is a preset for one).
