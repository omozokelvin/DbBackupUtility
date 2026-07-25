import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import * as Database from 'better-sqlite3';
import { Connector, ConnectionConfig, DatabaseStats } from '../types';

export class MySQLConnector implements Connector {
  private pool: mysql.Pool | null = null;
  private dbName: string = '';

  async connect(config: ConnectionConfig): Promise<void> {
    this.dbName = config.database;
    this.pool = mysql.createPool({
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.username,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      multipleStatements: true,
    });
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const tempPool = mysql.createPool({
        host: config.host || 'localhost',
        port: config.port || 3306,
        user: config.username,
        password: config.password,
        database: config.database,
      });

      const [rows] = await tempPool.query('SELECT 1');
      await tempPool.end();

      return (rows as { '1': number }[])[0]['1'] === 1;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    if (!this.pool) throw new Error('Not connected to database');

    const [rows] = await this.pool.query(
      "SHOW TABLES",
    );

    const tableName = (rows as { Tables_in_${string}[] }[])[0]
      ? Object.keys((rows as { Tables_in_${string}[] }[])[0])[0]
      : null;

    if (!tableName) return [];

    return (rows as Record<string, string>[]).map((row) => row[tableName]);
  }

  async getCollections(): Promise<string[]> {
    return [];
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.pool) throw new Error('Not connected to database');

    const tables = await this.getTables();

    let totalRecords = 0;
    let totalSize = 0;

    for (const table of tables) {
      const [row] = await this.pool!.query(
        `SELECT TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH 
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [config.database, table],
      );

      const stats = (row as { TABLE_ROWS: number; DATA_LENGTH: number; INDEX_LENGTH: number })[];
      if (stats[0]) {
        totalRecords += stats[0].TABLE_ROWS;
        totalSize += stats[0].DATA_LENGTH + stats[0].INDEX_LENGTH;
      }
    }

    return {
      tables,
      totalRecords,
      totalSize,
    };
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    if (!this.pool) throw new Error('Not connected to database');

    const [versionResult] = await this.pool.query('SELECT VERSION() as version');
    const version = (versionResult as { version: string }[])[0].version;

    return {
      type: 'mysql',
      version,
    };
  }
}
