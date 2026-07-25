import { Client as PgClient } from 'pg';
import { Connector, ConnectionConfig, DatabaseStats } from '../types';

export class PostgreSQLConnector implements Connector {
  private client: PgClient | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    this.client = new PgClient({
      host: config.host || 'localhost',
      port: config.port || 5432,
      user: config.username,
      password: config.password,
      database: config.database,
    });
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const tempClient = new PgClient({
        host: config.host || 'localhost',
        port: config.port || 5432,
        user: config.username,
        password: config.password,
        database: config.database,
      });
      await tempClient.connect();
      await tempClient.query('SELECT 1');
      await tempClient.end();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    if (!this.client) throw new Error('Not connected to database');

    const result = await this.client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );

    return result.rows.map((row) => row.table_name);
  }

  async getCollections(): Promise<string[]> {
    return [];
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.client) throw new Error('Not connected to database');

    const tables = await this.getTables();

    let totalRecords = 0;
    let totalSize = 0;

    for (const table of tables) {
      const [countResult] = await this.client!.query(
        `SELECT COUNT(*) FROM ${this.client.escapeIdentifier(table)}`,
      );
      totalRecords += (countResult as { count: string }).count;

      const [sizeResult] = await this.client!.query(
        `SELECT pg_total_relation_size(${this.client.escapeIdentifier(table)}) as size`,
      );
      totalSize += (sizeResult as { size: number }).size;
    }

    return {
      tables,
      totalRecords,
      totalSize,
    };
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error('Not connected to database');

    const [versionResult] = await this.client.query('SELECT version() as version');
    const version = (versionResult as { version: string }[])[0].version;

    return {
      type: 'postgresql',
      version,
    };
  }
}
