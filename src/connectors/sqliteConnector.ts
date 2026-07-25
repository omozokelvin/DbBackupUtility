import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Connector, ConnectionConfig, DatabaseStats } from '../types';

export class SQLiteConnector implements Connector {
  private db: Database.Database | null = null;
  private dbPath: string = '';

  async connect(config: ConnectionConfig): Promise<void> {
    this.dbPath = config.sqlitePath || path.join(process.cwd(), `${config.database}.db`);

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const testPath = config.sqlitePath || path.join(process.cwd(), `${config.database}.db`);
      const testDb = new Database(testPath);
      testDb.close();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    if (!this.db) throw new Error('Not connected to database');

    const tables = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as { name: string }[];

    return tables.map((t) => t.name);
  }

  async getCollections(): Promise<string[]> {
    return [];
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.db) throw new Error('Not connected to database');

    const tables = await this.getTables();

    let totalRecords = 0;
    let totalSize = 0;

    for (const table of tables) {
      const countResult = this.db!.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      totalRecords += countResult.count;
    }

    totalSize = fs.statSync(this.dbPath).size;

    return {
      tables,
      totalRecords,
      totalSize,
    };
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    if (!this.db) throw new Error('Not connected to database');

    const version = this.db.prepare('SELECT sqlite_version() as version').get() as { version: string };

    return {
      type: 'sqlite',
      version: version.version,
      databasePath: this.dbPath,
    };
  }
}
