import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { BackupLog } from '../types';

const LOG_DIR = path.join(process.cwd(), 'logs');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export class BackupLogger {
  private fileLogger: winston.Logger;
  private consoleLogger: winston.Logger;

  constructor() {
    ensureLogDir();

    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    this.fileLogger = winston.createLogger({
      level: 'debug',
      format: logFormat,
      transports: [
        new winston.transports.File({
          filename: path.join(LOG_DIR, 'backup-error.log'),
          level: 'error',
          maxsize: 5242880,
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: path.join(LOG_DIR, 'backup-combined.log'),
          maxsize: 5242880,
          maxFiles: 5,
        }),
      ],
    });

    this.consoleLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, context }) => {
          const ctx = context ? ` [${JSON.stringify(context)}]` : '';
          return `[${timestamp}] ${level}: ${message}${ctx}`;
        }),
      ),
      transports: [new winston.transports.Console()],
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.fileLogger.info(message, context);
    this.consoleLogger.info(message, { context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.fileLogger.warn(message, context);
    this.consoleLogger.warn(message, { context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.fileLogger.error(message, context);
    this.consoleLogger.error(message, { context });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.fileLogger.debug(message, context);
    this.consoleLogger.debug(message, { context });
  }

  logBackupActivity(log: BackupLog): void {
    const level = log.level;
    const context = { ...log.context, logId: log.id };

    switch (level) {
      case 'error':
        this.error(log.message, context);
        break;
      case 'warn':
        this.warn(log.message, context);
        break;
      case 'debug':
        this.debug(log.message, context);
        break;
      default:
        this.info(log.message, context);
    }
  }

  createBackupLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>,
  ): BackupLog {
    const log: BackupLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      context,
    };

    this.logBackupActivity(log);
    return log;
  }

  writeBackupLogToFile(log: BackupLog): void {
    ensureLogDir();
    const logFile = path.join(LOG_DIR, `backup-${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  }
}
