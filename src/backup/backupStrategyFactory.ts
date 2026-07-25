import { BackupStrategy, BackupType, DatabaseType, BackupLogger, Notifier, BackupConfig, BackupResult } from '../types';
import { FullBackupStrategy } from './fullBackupStrategy';
import { IncrementalBackupStrategy } from './incrementalBackupStrategy';
import { DifferentialBackupStrategy } from './differentialBackupStrategy';

export class BackupStrategyFactory {
  static createStrategy(
    backupType: BackupType,
    logger: BackupLogger,
    notifier?: Notifier,
  ): BackupStrategy {
    switch (backupType) {
      case 'full':
        return new FullBackupStrategy(logger, notifier);
      case 'incremental':
        return new IncrementalBackupStrategy(logger, notifier);
      case 'differential':
        return new DifferentialBackupStrategy(logger, notifier);
      default:
        throw new Error(`Unsupported backup type: ${backupType}`);
    }
  }
}
