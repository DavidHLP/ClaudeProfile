# Contributing to ClaudeProfile

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

TypeScript compiles from `src/` to `dist/`. The CLI entry point at `bin/claude-profile.js` imports from `dist/`.

### Link for Local Development

```bash
npm link
# Or manually:
ln -sf $(pwd)/bin/claude-profile.js ~/.local/bin/claude-profile && chmod +x ~/.local/bin/claude-profile
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run test suite once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run prepublishOnly` | Build before publishing |

## Testing

We use **Vitest** for testing. All tests live in the `tests/` directory.

### Run Tests

```bash
npm test
```

### Coverage

```bash
npx vitest run --coverage
```

### Test Conventions

- Use `.js` suffix in test imports even for TypeScript sources: `from '../src/templates/providerRegistry.js'`
- When testing singletons (e.g., `providerRegistry`), create fresh instances in `beforeEach` to avoid test pollution
- Use `CommandResult` type guards: check `result.success` before accessing `result.output` or `result.error`

### Adding New Tests

1. Create a file in `tests/` named `<feature>.test.ts`
2. Import the module under test with `.js` extension
3. Arrange-Act-Assert pattern is preferred

## Code Style

- **TypeScript**: strict mode enabled
- **File naming**: camelCase (`fileSystemConfigStore.ts`)
- **Type naming**: PascalCase (`Profile`, `ConfigStore`)
- **Immutability**: use spread operator for object updates; never mutate existing objects
- **Error handling**: use custom `AppError` subclasses; wrap errors with context

## Project Structure

```
src/
├── commands/      CLI command handlers
├── config/        ConfigStore interface + implementations
├── engine/        Core logic (settingsSync, activation)
├── errors.ts      Custom error hierarchy
├── index.ts       Public API exports
├── plugins/       Plugin system (types, loader, manager, discovery, validator)
├── presenters/    UI output formatting (ANSI tables, env export)
├── services/      Business services (ProfileService, SettingsSyncService)
├── templates/     Provider templates + env template engine
├── types/         TypeScript type definitions
├── ui/            Interactive prompts (inquirer wrappers)
└── utils/         Utilities (connectivity, validation)
```

## Debugging the CLI

Run directly via Node to bypass global installation:

```bash
node bin/claude-profile.js <command> [options]
```

After modifying `src/`, rebuild with `npm run build` before testing the CLI.

## Shell Completion Syntax Check

```bash
node bin/claude-profile.js completion bash | bash -n
```

No output means the generated completion script is syntactically valid.

## PR Checklist

Before submitting a pull request:

- [ ] `npm run build` passes without errors
- [ ] `npm test` passes
- [ ] New functionality has test coverage
- [ ] No `console.log` statements left in production code
- [ ] No hardcoded secrets or credentials
- [ ] Documentation updated (README, codemaps if architecture changed)
