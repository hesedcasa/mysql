# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mysql** is an Oclif-based CLI tool for interacting with the Bitbucket Cloud REST API v2. It provides comprehensive access to Bitbucket functionality including repositories, pull requests, pipelines, and workspaces.

## Development Commands

```bash
# Build
npm run build

# Run all tests
npm test

# Run a single test file
npx mocha test/path/to/test.test.ts

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format

# Find dead code
npm run find-deadcode
```

## Architecture

The project follows a layered architecture with clear separation of concerns:

```
src/
├── commands/mysql/      # Oclif CLI commands, all namespaced under mysql/
│   ├── auth/        # auth add, test, update
│   ├── pipeline/    # pipeline get, list, trigger
│   ├── pr/          # pr approve, create, decline, get, list, merge, unapprove, update
│   ├── repo/        # repo create, delete, get, list
│   └── workspace/   # workspace get, list
├── bitbucket/       # Bitbucket REST API layer
│   ├── bitbucket-api.ts     # BitbucketApi class with core API methods
│   └── bitbucket-client.ts  # Wrapper functions with singleton pattern
├── config.ts        # Configuration management (auth config)
└── format.ts        # Output formatting (TOON format)
```

### Key Architectural Patterns

**1. Three-Tier Command Pattern:**

- **Commands** (`src/commands/mysql/`) - Thin Oclif command wrappers that parse args/flags
- **Client Layer** (`bitbucket-client.ts`) - Functional wrappers with singleton pattern
- **API Layer** (`bitbucket-api.ts`) - Core API class using native `fetch` for Bitbucket REST API v2

**2. ApiResult Pattern:**
All API functions return `ApiResult` objects (non-generic):

```typescript
interface ApiResult {
  data?: unknown
  error?: unknown
  success: boolean
}
```

**3. Singleton Client Pattern:**
`bitbucket-client.ts` maintains a singleton instance of the `BitbucketApi` class. Commands should call `clearClients()` after use for cleanup.

## Adding a New Command

1. Create command file in `src/commands/mysql/<category>/<name>.ts`
2. Extend `Command` from `@oclif/core`
3. Define static `args`, `flags`, `description`, and `examples`
4. In `run()` method:
   - Parse args/flags
   - Read config with `readConfig(this.config.configDir, this.log)`
   - Call appropriate client function from `bitbucket-client.ts`
   - Call `clearClients()` for cleanup
   - Output with `this.logJson(result)` or `this.log(formatAsToon(result))`

Example pattern from `src/commands/mysql/repo/get.ts`:

```typescript
import {Args, Command, Flags} from '@oclif/core'

import {clearClients, getRepository} from '../../../bitbucket/bitbucket-client.js'
import {readConfig} from '../../../config.js'
import {formatAsToon} from '../../../format.js'

export default class RepoGet extends Command {
  /* eslint-disable perfectionist/sort-objects */
  static override args = {
    workspace: Args.string({description: 'Workspace slug or UUID', required: true}),
    repoSlug: Args.string({description: 'Repository slug', required: true}),
  }
  /* eslint-enable perfectionist/sort-objects */
  static override description = 'Get details of a specific repository'
  static override examples = ['<%= config.bin %> <%= command.id %> my-workspace my-repo']
  static override flags = {
    toon: Flags.boolean({description: 'Format output as toon', required: false}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(RepoGet)
    const config = await readConfig(this.config.configDir, this.log.bind(this))
    if (!config) {
      return
    }

    const result = await getRepository(config.auth, args.workspace, args.repoSlug)
    clearClients()

    if (flags.toon) {
      this.log(formatAsToon(result))
    } else {
      this.logJson(result)
    }
  }
}
```

## Adding New API Functions

1. Add method to `BitbucketApi` class in `bitbucket-api.ts`
2. Export wrapper function in `bitbucket-client.ts` with `initBitbucket` pattern
3. Use `ApiResult` return type for consistent error handling

## Configuration

Authentication config is stored in JSON at `~/.config/mysql/mysql-config.json` (platform-dependent):

```json
{
  "auth": {
    "email": "user@example.com",
    "apiToken": "token"
  }
}
```

## Testing

- Tests mirror source structure in `test/` directory (e.g. `test/commands/mysql/repo/get.test.ts`)
- Mocha + Chai for testing
- `esmock` for module mocking, `sinon` for stub/spy/mock objects
- Tests use `ts-node` for TypeScript execution (see `.mocharc.json`)
- 60-second timeout for all tests

Two distinct testing patterns depending on layer:

**Command tests** (`test/commands/mysql/`): Use `esmock` to mock all three dependencies, instantiate the command class directly, and stub `logJson`/`log` on the instance:

```typescript
const imported = await esmock('../../../../src/commands/mysql/repo/get.js', {
  '../../../../src/bitbucket/bitbucket-client.js': {clearClients: clearClientsStub, getRepository: getRepositoryStub},
  '../../../../src/config.js': {readConfig: readConfigStub},
  '../../../../src/format.js': {formatAsToon: formatAsToonStub},
})
const RepoGet = imported.default
const cmd = new RepoGet(['my-ws', 'my-repo'], {
  root: process.cwd(),
  runHook: stub().resolves({failures: [], successes: []}),
} as any)
stub(cmd, 'logJson')
await cmd.run()
```

**API layer tests** (`test/bitbucket/bitbucket-api.test.ts`): Stub `globalThis.fetch` directly:

```typescript
fetchStub = stub(globalThis, 'fetch')
fetchStub.resolves(new Response(JSON.stringify({...}), {status: 200}))
// restore in afterEach: fetchStub.restore()
```

## Output Formatting

- Default: JSON via `this.logJson()`
- TOON format: Custom token-oriented format via `formatAsToon()` (using `@toon-format/toon`)
- Use `--toon` flag to enable TOON output

## Dependencies

- **@oclif/core** - CLI framework
- **@toon-format/toon** - TOON output format
- **@inquirer/prompts** - Interactive prompts
- **fs-extra** - File system utilities

## Important Notes

- All command files use ES modules (`.js` extensions in imports)
- Uses native `fetch` (Node.js 18+) for Bitbucket REST API calls — no external HTTP library needed
- The Bitbucket REST API base URL is always hardcoded to `https://api.bitbucket.org/2.0`; the `host` field in config is not used for API requests
- Functions with more than 3 parameters require `// eslint-disable-next-line max-params` above the function signature
- JSDoc `@param` for inline object parameters must list each property individually with dot-notation (e.g. `@param options.description`) to satisfy the JSDoc linter
- The `static override args` block in commands must be wrapped with `/* eslint-disable/enable perfectionist/sort-objects */` because Oclif processes args positionally (declaration order = parse order), preventing alphabetical sorting
- Pre-commit hook runs format and dead code detection
- Uses `shx` for cross-platform shell commands
- Node.js >=18.0.0 required
- Published as npm package `mysql`

## Commit Message Convention

**Always use Conventional Commits format** for all commit messages and PR titles:

- `feat:` - New features or capabilities
- `fix:` - Bug fixes
- `docs:` - Documentation changes only
- `refactor:` - Code refactoring without changing functionality
- `test:` - Adding or modifying tests
- `chore:` - Maintenance tasks, dependency updates, build configuration

**Examples:**

```
feat: add list-repos command for workspaces
fix: handle connection timeout errors gracefully
docs: update configuration examples in README
refactor: extract API formatting into separate module
test: add integration tests for Bitbucket operations
chore: update dependencies to latest versions
```
