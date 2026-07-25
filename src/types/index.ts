export type DatabaseType = 'mysql' | 'postgresql' | 'mongodb' | 'sqlite';

export type BackupType = 'full' | 'incremental' | 'differential';

export type StorageType = 'local' | 's3';

export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed' | 'restoring' | 'restore_completed' | 'restore_failed';

export interface ConnectionConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  options?: Record<string, unknown>;
  sqlitePath?: string;
}

export interface BackupConfig {
  id: string;
  name: string;
  connection: ConnectionConfig;
  backupType: BackupType;
  storageType: StorageType;
  outputPath?: string;
  compression: boolean;
  compressionLevel?: number;
  s3Config?: S3StorageConfig;
  schedule?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  prefix?: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
  };
}

export interface BackupResult {
  id: string;
  name: string;
  status: BackupStatus;
  startTime: Date;
  endTime?: Date;
  fileSize?: number;
  filePath?: string;
  compressionRatio?: number;
  error?: string;
  tables?: string[];
  collections?: string[];
  recordsBackedUp?: number;
  duration?: number;
}

export interface RestoreResult {
  id: string;
  status: BackupStatus;
  startTime: Date;
  endTime?: Date;
  sourceFile: string;
  targetDatabase: ConnectionConfig;
  selectiveTables?: string[];
  selectiveCollections?: string[];
  error?: string;
  recordsRestored?: number;
  duration?: number;
}

export interface BackupLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, unknown>;
}

export interface NotificationConfig {
  enabled: boolean;
  email?: EmailNotificationConfig;
  recipients?: string[];
}

export interface EmailNotificationConfig {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  from: string;
  useTls?: boolean;
}

export interface ScheduleConfig {
  cronExpression: string;
  enabled: boolean;
  timezone?: string;
}

export interface FullBackupConfig {
  backupConfig: BackupConfig;
  notificationConfig?: NotificationConfig;
  scheduleConfig?: ScheduleConfig;
}

export interface IncrementalBackupConfig {
  backupConfig: BackupConfig;
  lastBackupTimestamp: Date;
  notificationConfig?: NotificationConfig;
}

export interface DifferentialBackupConfig {
  backupConfig: BackupConfig;
  lastFullBackupTimestamp: Date;
  notificationConfig?: NotificationConfig;
}

export interface RestoreConfig {
  backupFile: string;
  connection: ConnectionConfig;
  selectiveTables?: string[];
  selectiveCollections?: string[];
  notificationConfig?: NotificationConfig;
}

export interface DatabaseStats {
  tables?: string[];
  collections?: string[];
  totalRecords: number;
  totalSize: number;
  lastModified?: Date;
}

export interface Connector {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(config: ConnectionConfig): Promise<boolean>;
  getTables(): Promise<string[]>;
  getCollections(): Promise<string[]>;
  getDatabaseStats(): Promise<DatabaseStats>;
  getMetadata(): Promise<Record<string, unknown>>;
}

export interface BackupStrategy {
  backup(config: BackupConfig): Promise<BackupResult>;
  validateBackupType(dbType: DatabaseType, backupType: BackupType): boolean;
}

export interface StorageProvider {
  save(filePath: string, config: BackupConfig): Promise<string>;
  restore(filePath: string, outputPath: string): Promise<string>;
  delete(filePath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  listBackups(): Promise<BackupResult[]>;
}

export interface Notifier {
  send(result: BackupResult | RestoreResult): Promise<void>;
  configure(config: NotificationConfig): void;
  generateNotificationMessage(result: BackupResult | RestoreResult): string;
}
