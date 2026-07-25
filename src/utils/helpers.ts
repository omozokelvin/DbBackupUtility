import { v4 as uuidv4 } from 'uuid';

export function generateBackupId(): string {
  return `backup_${Date.now()}_${uuidv4().substring(0, 8)}`;
}

export function generateRestoreId(): string {
  return `restore_${Date.now()}_${uuidv4().substring(0, 8)}`;
}

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function calculateCompressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return ((originalSize - compressedSize) / originalSize) * 100;
}

export function parseConnectionString(connectionString: string): Record<string, string> {
  const params: Record<string, string> = {};
  const url = new URL(connectionString);

  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }

  return params;
}

export function isCloudStorage(type: string): boolean {
  return ['s3', 'gcs', 'azure'].includes(type);
}

export function validateConnectionConfig(config: Record<string, unknown>): boolean {
  if (!config.database) return false;
  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
