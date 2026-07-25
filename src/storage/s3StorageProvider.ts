import * as fs from 'fs';
import * as path from 'path';
import AWS from 'aws-sdk';
import { StorageProvider, BackupConfig, BackupResult, S3StorageConfig } from '../types';
import { BackupLogger } from '../logging/backupLogger';

export class S3StorageProvider implements StorageProvider {
  private logger: BackupLogger;
  private s3: AWS.S3;
  private config: S3StorageConfig;

  constructor(logger: BackupLogger, s3Config: S3StorageConfig) {
    this.logger = logger;
    this.config = s3Config;

    const s3Options: AWS.S3.ClientConfig = {
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.credentials.accessKeyId,
        secretAccessKey: s3Config.credentials.secretAccessKey,
      },
    };

    if (s3Config.credentials.endpoint) {
      s3Options.endpoint = s3Config.credentials.endpoint;
    }

    this.s3 = new AWS.S3(s3Options);
  }

  async save(filePath: string, config: BackupConfig): Promise<string> {
    const key = this.generateS3Key(config.name, path.basename(filePath));

    const fileContent = fs.readFileSync(filePath);

    const params: AWS.S3.Types.PutObjectRequest = {
      Bucket: this.config.bucket,
      Key: key,
      Body: fileContent,
      Metadata: {
        'backup-name': config.name,
        'backup-type': config.backupType,
        'database-type': config.connection.type,
      },
    };

    await this.s3.putObject(params).promise();

    this.logger.info(`File uploaded to S3`, {
      bucket: this.config.bucket,
      key,
      filePath,
    });

    return `s3://${this.config.bucket}/${key}`;
  }

  async restore(filePath: string, outputPath: string): Promise<string> {
    const { Bucket, Key } = this.parseS3Uri(filePath);

    const params: AWS.S3.Types.GetObjectRequest = {
      Bucket,
      Key,
    };

    const response = await this.s3.getObject(params).promise();

    const localPath = outputPath || path.join(process.cwd(), 'restores');
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    const destPath = path.join(localPath, Key.split('/').pop() || 'backup.tar.gz');

    fs.writeFileSync(destPath, response.Body as Buffer);

    this.logger.info(`File downloaded from S3`, {
      bucket: Bucket,
      key: Key,
      destination: destPath,
    });

    return destPath;
  }

  async delete(filePath: string): Promise<void> {
    const { Bucket, Key } = this.parseS3Uri(filePath);

    const params: AWS.S3.Types.DeleteObjectRequest = {
      Bucket: this.config.bucket,
      Key,
    };

    await this.s3.deleteObject(params).promise();

    this.logger.info(`File deleted from S3`, {
      bucket: Bucket,
      key: Key,
    });
  }

  async exists(filePath: string): Promise<boolean> {
    const { Bucket, Key } = this.parseS3Uri(filePath);

    try {
      await this.s3.headObject({ Bucket, Key }).promise();
      return true;
    } catch {
      return false;
    }
  }

  async listBackups(): Promise<BackupResult[]> {
    const backups: BackupResult[] = [];

    const params: AWS.S3.Types.ListObjectsV2Request = {
      Bucket: this.config.bucket,
      Prefix: this.config.prefix || '',
    };

    const response = await this.s3.listObjectsV2(params).promise();

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key && object.Size) {
          const metadata = await this.getObjectMetadata(object.Key);

          backups.push({
            id: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: metadata['backup-name'] || 'unknown',
            status: 'completed',
            startTime: object.LastModified || new Date(),
            endTime: object.LastModified || new Date(),
            filePath: `s3://${this.config.bucket}/${object.Key}`,
            fileSize: object.Size,
          });
        }
      }
    }

    return backups.sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0));
  }

  private generateS3Key(databaseName: string, fileName: string): string {
    const prefix = this.config.prefix || '';
    const date = new Date().toISOString().split('T')[0];

    return [prefix, databaseName, date, fileName].filter(Boolean).join('/');
  }

  private parseS3Uri(uri: string): { Bucket: string; Key: string } {
    const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);

    if (!match) {
      throw new Error(`Invalid S3 URI: ${uri}`);
    }

    return {
      Bucket: match[1],
      Key: match[2],
    };
  }

  private async getObjectMetadata(key: string): Promise<Record<string, string>> {
    try {
      const response = await this.s3.headObject({
        Bucket: this.config.bucket,
        Key: key,
      }).promise();

      const metadata: Record<string, string> = {};

      if (response.Metadata) {
        Object.assign(metadata, response.Metadata);
      }

      return metadata;
    } catch {
      return {};
    }
  }
}
