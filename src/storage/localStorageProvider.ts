import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, BackupConfig, BackupResult, StorageType, S3StorageConfig } from '../types';
import { BackupLogger } from '../logging/backupLogger';
import AWS from 'aws-sdk';

export class LocalStorageProvider implements StorageProvider {
  private logger: BackupLogger;
  private baseDir: string;

  constructor(logger: BackupLogger, baseDir: string = path.join(process.cwd(), 'backups')) {
    this.logger = logger;
    this.baseDir = baseDir;
  }

  async save(filePath: string, config: BackupConfig): Promise<string> {
    const targetPath = config.outputPath || this.baseDir;

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    const destPath = path.join(targetPath, path.basename(filePath));

    fs.copyFileSync(filePath, destPath);

    this.logger.info(`File saved to local storage`, {
      source: filePath,
      destination: destPath,
    });

    return destPath;
  }

  async restore(filePath: string, outputPath: string): Promise<string> {
    const targetPath = outputPath || path.join(process.cwd(), 'restores');

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    const destPath = path.join(targetPath, path.basename(filePath));

    fs.copyFileSync(filePath, destPath);

    this.logger.info(`File restored from storage`, {
      source: filePath,
      destination: destPath,
    });

    return destPath;
  }

  async delete(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.info(`File deleted from storage`, { filePath });
    }
  }

  async exists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  }

  async listBackups(): Promise<BackupResult[]> {
    const backups: BackupResult[] = [];

    if (!fs.existsSync(this.baseDir)) {
      return backups;
    }

    const dirs = fs.readdirSync(this.baseDir);

    for (const dir of dirs) {
      const dirPath = path.join(this.baseDir, dir);

      if (fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);

          backups.push({
            id: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: dir,
            status: 'completed',
            startTime: stats.mtime,
            endTime: stats.mtime,
            filePath,
            fileSize: stats.size,
          });
        }
      }
    }

    return backups.sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0));
  }
}
