# DbBackupUtility - Agent Instructions

## Project structure

```
src/
  index.ts          -- CLI entry point (bin: db-backup)
  types/index.ts    -- All shared interfaces (Connector, BackupStrategy, StorageProvider, Notifier)
  connectors/       -- DB-specific connectors: MySQL, PostgreSQL, MongoDB, SQLite
  backup/           -- Strategies: full, incremental, differential + BackupRestorer
  storage/          -- Local filesystem + S3 providers
  logging/          -- BackupLogger (winston-based)
  utils/            -- EmailNotifier, helpers
```

## Key commands

```
npm run build    -- Compile TypeScript (tsc, outputs to ./dist)
npm start        -- Run CLI via ts-node (src/index.ts)
npm run lint     -- ESLint on src/**/*.ts
npm run format   -- Prettier write on src/**/*.ts
npm test         -- Jest (no config file; uses defaults)
```

## Architecture notes

- **Three factory layers**: `ConnectorFactory` (db type), `BackupStrategyFactory` (backup type), `StorageProviderFactory` (storage location). All return interfaces defined in `src/types/index.ts`.
- **No tests exist.** The `tests/` directory is absent. Do not assume test coverage.
- **No lint/prettier config files** at repo root. Commands reference `src/**/*.ts` globs but run with defaults.
- **No README exists.** The package.json `description` is the only prose documentation.
- **No `.env` or `.env.example`.** Config is passed programmatically via `ConnectionConfig` / `BackupConfig` objects. S3 credentials live in `S3StorageConfig.credentials`.
- **TypeScript path alias**: `@/*` resolves to `src/*` (see `tsconfig.json`).

## Gotchas

- `fullBackupStrategy.ts` uses `require()` for `ConnectorFactory` (dynamic import inside a method). This works but bypasses type checking.
- `backupRestorer.ts` calls `gunzip` via `execSync` for `.gz` files (not `.tar.gz`). This is a shell dependency — `gunzip` must be available on the host.
- The `tar` package is used for extraction but is not listed in `package.json` dependencies. Verify it is installed before running restore on `.tar.gz` files.
- `@types/blessed` is a devDependency but unused — likely a leftover.
- `@types/mysql` and `@types/pg` are listed but the MySQL connector uses `mysql2` (which ships its own types). The pg connector uses `pg` directly.
