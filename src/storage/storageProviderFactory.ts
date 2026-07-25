import { StorageProvider, BackupConfig, StorageType, S3StorageConfig, BackupLogger } from '../types';
import { LocalStorageProvider } from './localStorageProvider';
import { S3StorageProvider } from './s3StorageProvider';

export class StorageProviderFactory {
  static createProvider(
    storageType: StorageType,
    logger: BackupLogger,
    s3Config?: S3StorageConfig,
    baseDir?: string,
  ): StorageProvider {
    switch (storageType) {
      case 'local':
        return new LocalStorageProvider(logger, baseDir);
      case 's3':
        if (!s3Config) {
          throw new Error('S3 configuration is required for S3 storage');
        }
        return new S3StorageProvider(logger, s3Config);
      default:
        throw new Error(`Unsupported storage type: ${storageType}`);
    }
  }
}
