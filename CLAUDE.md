# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mq** is an Oclif-based CLI tool (`bin: mq`) for interacting with MySQL databases. It supports multi-profile connection management, safe query execution, and multiple output formats.

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

```
src/
├── commands/mysql/      # Oclif CLI commands (namespace: mysql)
│   ├── auth/            # auth add, auth test, auth update
│   ├── query.ts         # Execute arbitrary SQL
│   ├── databases.ts
│   ├── tables.ts
│   ├── describe-table.ts
│   ├── indexes.ts
│   └── explain-query.ts
├── mysql/               # MySQL interaction layer
│   ├── mysql-client.ts  # Singleton client + exported functions (setConfigDir, getMySQLConfig, executeQuery, etc.)
│   ├── mysql-utils.ts   # MySQLUtil class — connection pooling, formatting, safety enforcement
│   ├── config-loader.ts # MySQLConfig type + getMySQLConnectionOptions()
│   ├── database.ts      # Result interfaces (QueryResult, DatabaseListResult, etc.)
│   ├── query-validator.ts # Safety checks: blacklist, confirmation, auto-LIMIT, query analysis
│   └── index.ts         # Re-exports from mysql-client.ts and database.ts
└── config.ts            # readConfig(), DatabaseProfile, MySQLJsonConfig interfaces
```

### Key Architectural Patterns

**1. Command Pattern:**

Commands are thin Oclif wrappers that:

1. Call `setConfigDir(this.config.configDir)` before any MySQL operation
2. Resolve the profile: `flags.profile ?? (await getMySQLConfig()).defaultProfile`
3. Call a function from `src/mysql/index.js`
4. Call `await closeConnections()` for cleanup
5. Output with `this.log(result.result)`, `this.logJson(...)`, or `this.error(...)`

**2. Singleton Client (`mysql-client.ts`):**

`initMySQL()` lazily creates a `MySQLUtil` instance using the JSON config loaded from `cachedConfigDir`. `getMySQLConfig()` returns the cached `MySQLConfig`. `closeConnections()` tears down all connections and resets the singleton.

**3. Safety System (`query-validator.ts` + `MySQLUtil`):**

- `checkBlacklist`: blocks operations in `blacklistedOperations` (e.g. `DROP DATABASE`)
- `requiresConfirmation`: returns `requiresConfirmation: true` for destructive ops (DELETE, UPDATE, DROP, TRUNCATE, ALTER) unless `skipConfirmation=true`
- `analyzeQuery`: produces warnings for missing WHERE, SELECT \*, missing LIMIT
- `applyDefaultLimit`: auto-appends `LIMIT 100` to SELECT queries without one

**4. Result Types (`database.ts`):**

All MySQL functions return typed result objects with a `success: boolean` field and optional `error` string. Commands check `result.success` to decide whether to log or error.

## Adding a New Command

1. Create `src/commands/mysql/<name>.ts` extending `Command`
2. Follow the pattern from `src/commands/mysql/tables.ts`:

```typescript
import {Command, Flags} from '@oclif/core'
import {closeConnections, getMySQLConfig, listTables, setConfigDir} from '../../mysql/index.js'

export default class MySQLTables extends Command {
  static override flags = {
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MySQLTables)
    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getMySQLConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }
    const result = await listTables(profile)
    await closeConnections()
    if (result.success) {
      this.logJson(result.tables)
    } else {
      this.error(result.error ?? 'Failed')
    }
  }
}
```

3. Add the corresponding function to `MySQLUtil` in `mysql-utils.ts`, export it through `mysql-client.ts` and `mysql/index.ts`

## Configuration

Stored at `~/.config/mysql/mysql-config.json` (multi-profile format):

```json
{
  "defaultProfile": "local",
  "profiles": {
    "local": {
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "password": "secret",
      "database": "mydb",
      "ssl": false
    }
  }
}
```

Auth commands (`mq mysql auth add/test/update`) manage this file. `auth add` creates the file with mode `0o600`.

## Testing

- Tests mirror source structure in `test/` (e.g. `test/commands/mysql/query.test.ts`)
- Mocha + Chai, `esmock` for module mocking, `sinon` for stubs
- 60-second timeout for all tests

**Command tests** — use `esmock` to mock `src/mysql/index.js`, instantiate the command directly, stub `log`/`logJson` on the instance:

```typescript
const imported = await esmock('../../../src/commands/mysql/query.js', {
  '../../../src/mysql/index.js': {
    closeConnections: closeConnectionsStub,
    executeQuery: executeQueryStub,
    getMySQLConfig: getMySQLConfigStub, // stub().resolves(mockConfig)
    setConfigDir: setConfigDirStub,
  },
})
const MySQLQuery = imported.default
const cmd = new MySQLQuery(['SELECT 1'], {
  root: process.cwd(),
  runHook: stub().resolves({failures: [], successes: []}),
} as any)
stub(cmd, 'log')
await cmd.run()
```

**MySQL layer tests** (`test/mysql/mysql-utils.test.ts`) — stub `mysql.createConnection` directly.

**Auth command tests** — mock `@inquirer/prompts` input function in `beforeEach` to avoid blocking on stdin:

```typescript
const mockInput = stub().callsFake(async ({message}: {message: string}) => {
  if (message.includes('Profile')) return 'local'
  if (message.includes('host')) return 'localhost'
  // ...
})
```

## Important Notes

- All imports use `.js` extensions (ES modules)
- The `static override args` block must be wrapped with `/* eslint-disable/enable perfectionist/sort-objects */` — Oclif parses args positionally
- Functions with more than 3 parameters require `// eslint-disable-next-line max-params` above the signature
- JSDoc `@param` for inline objects must use dot-notation per property (e.g. `@param options.description`)
- Pre-commit hook runs `npm run format && npm run find-deadcode`
- Node.js >=18.0.0 required

## Commit Message Convention

**Always use Conventional Commits format:**

- `feat:` — new features
- `fix:` — bug fixes
- `refactor:` — refactoring without behavior change
- `test:` — tests only
- `docs:` — documentation only
- `chore:` — maintenance, deps, build config
