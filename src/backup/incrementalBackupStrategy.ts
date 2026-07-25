import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  BackupStrategy,
  BackupConfig,
  BackupResult,
  DatabaseType,
  BackupType,
  Connector,
  BackupLogger,
  Notifier,
} from '../types';

export class IncrementalBackupStrategy implements BackupStrategy {
  private logger: BackupLogger;
  private notifier?: Notifier;

  constructor(logger: BackupLogger, notifier?: Notifier) {
    this.logger = logger;
    this.notifier = notifier;
  }

  async backup(config: BackupConfig): Promise<BackupResult> {
    const result: BackupResult = {
      id: config.id,
      name: config.name,
      status: 'running',
      startTime: new Date(),
    };

    try {
      this.logger.info(`Starting incremental backup for database: ${config.name}`, {
        database: config.name,
        type: config.connection.type,
        backupType: config.backupType,
      });

      const connector = this.createConnector(config.connection);
      await connector.connect(config.connection);

      const backupDir = path.join(
        config.outputPath || process.cwd(),
        'backups',
        config.name,
      );
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = Date.now();
      const fileName = `${config.name}_${config.connection.type}_incremental_${timestamp}`;
      const filePath = path.join(backupDir, `${fileName}.sql`);

      const lastBackupFile = this.findLastFullBackup(backupDir, config.name);

      if (lastBackupFile && !this.isIncrementalValid(lastBackupFile)) {
        this.logger.warn('No valid full backup found. Performing full backup instead.', {
          backupId: result.id,
        });

        const fullStrategy = new (require('./fullBackupStrategy').FullBackupStrategy)(this.logger, this.notifier);
        return fullStrategy.backup(config);
      }

      await this.exportChanges(connector, config, filePath, lastBackupFile);

      let finalPath = filePath;
      if (config.compression) {
        finalPath = await this.compressFile(filePath, backupDir, fileName);
        fs.unlinkSync(filePath);
      }

      const fileSize = fs.statSync(finalPath).size;

      result.status = 'completed';
      result.endTime = new Date();
      result.filePath = finalPath;
      result.fileSize = fileSize;
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      this.logger.info(`Incremental backup completed successfully`, {
        backupId: result.id,
        filePath: result.filePath,
        fileSize: result.fileSize,
      });

      if (this.notifier) {
        await this.notifier.send(result);
      }

      return result;
    } catch (error) {
      result.status = 'failed';
      result.endTime = new Date();
      result.error = (error as Error).message;
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      this.logger.error(`Incremental backup failed: ${(error as Error).message}`, {
        backupId: result.id,
        error: result.error,
      });

      if (this.notifier) {
        await this.notifier.send(result);
      }

      return result;
    }
  }

  validateBackupType(dbType: DatabaseType, backupType: BackupType): boolean {
    return backupType === 'incremental';
  }

  private createConnector(type: string): import('../types').Connector {
    const { ConnectorFactory } = require('../connectors/connectorFactory');
    return ConnectorFactory.createConnector(type as DatabaseType);
  }

  private findLastFullBackup(backupDir: string, dbName: string): string | null {
    const files = fs.readdirSync(backupDir).filter((f) => f.includes('full') || f.includes(dbName));
    const fullBackups = files.filter((f) => !f.includes('incremental') && !f.includes('differential'));

    if (fullBackups.length === 0) return null;

    fullBackups.sort((a, b) => {
      const aTime = parseInt(a.match(/(\d+)$/)?.[1] || '0');
      const bTime = parseInt(b.match(/(\d+)$/)?.[1] || '0');
      return bTime - aTime;
    });

    return path.join(backupDir, fullBackups[0]);
  }

  private isIncrementalValid(lastFullBackup: string): boolean {
    const stats = fs.statSync(lastFullBackup);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000;

    return (now - stats.mtimeMs) < maxAge;
  }

  private async exportChanges(
    connector: import('../types').Connector,
    config: BackupConfig,
    filePath: string,
    lastFullBackup: string | null,
  ): Promise<void> {
    const output = fs.createWriteStream(filePath);

    let schema = `-- Incremental Backup\n`;
    schema += `-- Database Type: ${config.connection.type}\n`;
    schema += `-- Database Name: ${config.name}\n`;
    schema += `-- Backup Timestamp: ${new Date().toISOString()}\n`;
    schema += `-- Based on: ${lastFullBackup || 'Initial backup'}\n\n`;

    const tables = await connector.getTables();

    if (config.connection.type === 'mysql' || config.connection.type === 'postgresql') {
      schema += await this.exportTableChanges(connector, tables);
    } else if (config.connection.type === 'sqlite') {
      schema += await this.exportSqliteChanges(connector as any, tables);
    } else if (config.connection.type === 'mongodb') {
      const collections = await connector.getCollections();
      schema += await this.exportMongoDBChanges(connector as any, collections);
    }

    output.write(schema);
    output.end();

    await new Promise<void>((resolve, reject) => {
      output.on('finish', () => resolve());
      output.on('error', (err) => reject(err));
    });
  }

  private async exportTableChanges(
    connector: import('../types').Connector,
    tables: string[],
  ): Promise<string> {
    let schema = '-- Changed Tables Data\n';
    const client = connector.client || (connector as any).pool;

    for (const table of tables) {
      const result = await client!.query(`SELECT * FROM ${client!.escapeIdentifier(table)}`);
      schema += `-- Table: ${table} (${result.rows.length} rows)\n`;
    }

    return schema;
  }

  private async exportSqliteChanges(connector: any, tables: string[]): Promise<string> {
    let schema = '-- SQLite Changes\n';
    const db = connector.db;

    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      schema += `-- Table: ${table} (${rows.length} rows)\n`;
    }

    return schema;
  }

  private async exportMongoDBChanges(connector: any, collections: string[]): Promise<string> {
    let dump = '-- MongoDB Incremental Changes\n';
    const db = connector.db;

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();

      dump += `// Collection: ${collectionName} (${documents.length} documents)\n`;
      dump += `JSON: ${JSON.stringify(documents, null, 2)}\n\n`;
    }

    return dump;
  }

  private async compressFile(
    filePath: string,
    backupDir: string,
    fileName: string,
  ): Promise<string> {
    const compressedPath = path.join(backupDir, `${fileName}.tar.gz`);
    const output = fs.createWriteStream(compressedPath);

    return new Promise<void>((resolve, reject) => {
      const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });

      archive.on('error', (err) => reject(err));
      archive.on('finish', () => resolve());

      archive.pipe(output);
      archive.file(filePath, { name: `${path.basename(filePath)}` });
      archive.finalize();
    });
  }
}
