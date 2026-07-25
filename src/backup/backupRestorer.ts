import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import {
  RestoreConfig,
  RestoreResult,
  DatabaseType,
  ConnectionConfig,
  Connector,
  BackupLogger,
  Notifier,
} from '../types';

export class BackupRestorer {
  private logger: BackupLogger;
  private notifier?: Notifier;

  constructor(logger: BackupLogger, notifier?: Notifier) {
    this.logger = logger;
    this.notifier = notifier;
  }

  async restore(config: RestoreConfig): Promise<RestoreResult> {
    const result: RestoreResult = {
      id: `restore_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      status: 'running',
      startTime: new Date(),
      sourceFile: config.backupFile,
      targetDatabase: config.connection,
    };

    try {
      this.logger.info(`Starting restore from backup: ${config.backupFile}`, {
        backupFile: config.backupFile,
        targetDatabase: config.connection.database,
        databaseType: config.connection.type,
        selectiveTables: config.selectiveTables,
        selectiveCollections: config.selectiveCollections,
      });

      const connector = this.createConnector(config.connection.type);
      await connector.connect(config.connection);

      let extractDir = config.backupFile;

      if (config.backupFile.endsWith('.tar.gz') || config.backupFile.endsWith('.tgz')) {
        extractDir = await this.extractArchive(config.backupFile);
      } else if (config.backupFile.endsWith('.gz')) {
        extractDir = await this.decompressGzip(config.backupFile);
      }

      const files = fs.readdirSync(extractDir);
      const sqlFiles = files.filter((f) => f.endsWith('.sql'));
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      let recordsRestored = 0;

      if (sqlFiles.length > 0) {
        recordsRestored = await this.importSqlFiles(connector, sqlFiles, extractDir, config);
      } else if (jsonFiles.length > 0) {
        recordsRestored = await this.importJsonFiles(connector, jsonFiles, extractDir, config);
      }

      result.status = 'restore_completed';
      result.endTime = new Date();
      result.recordsRestored = recordsRestored;
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      this.logger.info(`Restore completed successfully`, {
        restoreId: result.id,
        recordsRestored: result.recordsRestored,
        duration: result.duration,
      });

      if (this.notifier) {
        await this.notifier.send(result);
      }

      return result;
    } catch (error) {
      result.status = 'restore_failed';
      result.endTime = new Date();
      result.error = (error as Error).message;
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      this.logger.error(`Restore failed: ${(error as Error).message}`, {
        restoreId: result.id,
        error: result.error,
      });

      if (this.notifier) {
        await this.notifier.send(result);
      }

      return result;
    }
  }

  private createConnector(type: string): Connector {
    const { ConnectorFactory } = require('../connectors/connectorFactory');
    return ConnectorFactory.createConnector(type as DatabaseType);
  }

  private async extractArchive(archivePath: string): Promise<string> {
    const extractDir = path.join(process.cwd(), 'extracted');
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    await tar.x({
      file: archivePath,
      cwd: extractDir,
    });

    this.logger.info(`Archive extracted`, {
      source: archivePath,
      destination: extractDir,
    });

    return extractDir;
  }

  private async decompressGzip(gzPath: string): Promise<string> {
    const { execSync } = require('child_process');
    const extractDir = path.join(process.cwd(), 'extracted');

    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    execSync(`gunzip -c "${gzPath}" > "${path.join(extractDir, path.basename(gzPath, '.gz'))}"`);

    this.logger.info(`Gzip file decompressed`, {
      source: gzPath,
      destination: extractDir,
    });

    return extractDir;
  }

  private async importSqlFiles(
    connector: Connector,
    sqlFiles: string[],
    extractDir: string,
    config: RestoreConfig,
  ): Promise<number> {
    let totalRecords = 0;

    for (const file of sqlFiles) {
      const filePath = path.join(extractDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      const records = await this.executeSqlStatements(connector, content, config);
      totalRecords += records;
    }

    return totalRecords;
  }

  private async executeSqlStatements(
    connector: Connector,
    content: string,
    config: RestoreConfig,
  ): Promise<number> {
    const lines = content.split('\n');
    const statements: string[] = [];
    let currentStatement = '';

    for (const line of lines) {
      if (line.startsWith('--') || line.trim() === '') {
        continue;
      }

      currentStatement += line + '\n';

      if (line.trim().endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    let recordsRestored = 0;

    if (config.connection.type === 'mysql') {
      const pool = (connector as any).pool;
      for (const statement of statements) {
        try {
          await pool.query(statement);
          recordsRestored++;
        } catch {
          this.logger.warn(`Failed to execute statement: ${statement.substring(0, 100)}`);
        }
      }
    } else if (config.connection.type === 'postgresql') {
      const client = (connector as any).client;
      for (const statement of statements) {
        try {
          await client.query(statement);
          recordsRestored++;
        } catch {
          this.logger.warn(`Failed to execute statement: ${statement.substring(0, 100)}`);
        }
      }
    } else if (config.connection.type === 'sqlite') {
      const db = (connector as any).db;
      for (const statement of statements) {
        try {
          db.exec(statement);
          recordsRestored++;
        } catch {
          this.logger.warn(`Failed to execute statement: ${statement.substring(0, 100)}`);
        }
      }
    }

    return recordsRestored;
  }

  private async importJsonFiles(
    connector: Connector,
    jsonFiles: string[],
    extractDir: string,
    config: RestoreConfig,
  ): Promise<number> {
    let totalRecords = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(extractDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (config.connection.type === 'mongodb') {
        const data = JSON.parse(content);
        totalRecords += await this.importMongoDBData(connector, data);
      }
    }

    return totalRecords;
  }

  private async importMongoDBData(
    connector: Connector,
    data: unknown[],
  ): Promise<number> {
    const db = (connector as any).db;
    let recordsInserted = 0;

    for (const collectionName of Object.keys(data)) {
      const collection = db.collection(collectionName);
      const documents = data[collectionName] || [];

      if (config.selectiveCollections && config.selectiveCollections.length > 0) {
        if (!config.selectiveCollections.includes(collectionName)) {
          continue;
        }
      }

      if (documents.length > 0) {
        await collection.insertMany(documents);
        recordsInserted += documents.length;
      }
    }

    return recordsInserted;
  }
}
