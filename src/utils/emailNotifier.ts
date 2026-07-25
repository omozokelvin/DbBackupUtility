import nodemailer, { Transporter, MailOptions } from 'nodemailer';
import { Notifier, NotificationConfig, BackupResult, RestoreResult, EmailNotificationConfig } from '../types';

export class EmailNotifier implements Notifier {
  private transporter: Transporter | null = null;
  private config: NotificationConfig | null = null;

  configure(config: NotificationConfig): void {
    this.config = config;

    if (config.enabled && config.email) {
      this.transporter = nodemailer.createTransport({
        host: config.email.smtpHost,
        port: config.email.smtpPort,
        secure: config.email.useTls || false,
        auth: {
          user: config.email.username,
          pass: config.email.password,
        },
      });
    }
  }

  async send(result: BackupResult | RestoreResult): Promise<void> {
    if (!this.config?.enabled || !this.config.email) {
      return;
    }

    const message = this.generateNotificationMessage(result);
    const emails = this.config.recipients || [];

    const mailOptions: MailOptions = {
      from: this.config.email.from,
      to: emails.join(', '),
      subject: this.getSubject(result),
      text: message,
      html: this.generateHtmlMessage(result),
    };

    try {
      await this.transporter?.sendMail(mailOptions);
    } catch (error) {
      console.error(`Failed to send email notification: ${(error as Error).message}`);
    }
  }

  generateNotificationMessage(result: BackupResult | RestoreResult): string {
    const isBackup = 'name' in result;
    const type = isBackup ? 'Backup' : 'Restore';
    const status = result.status.toUpperCase();
    const startTime = new Date(result.startTime).toLocaleString();
    const endTime = result.endTime ? new Date(result.endTime).toLocaleString() : 'N/A';

    let message = `${type} Notification\n`;
    message += `${'='.repeat(50)}\n\n`;
    message += `Status: ${status}\n`;
    message += `Start Time: ${startTime}\n`;
    message += `End Time: ${endTime}\n`;

    if ('name' in result) {
      const backupResult = result as BackupResult;
      message += `\nDatabase: ${backupResult.name}\n`;
      message += `File Size: ${backupResult.fileSize ? this.formatFileSize(backupResult.fileSize) : 'N/A'}\n`;
      message += `Compression: ${backupResult.compressionRatio ? backupResult.compressionRatio.toFixed(2) + '%' : 'N/A'}\n`;
      message += `Records Backed Up: ${backupResult.recordsBackedUp || 'N/A'}\n`;
      message += `Duration: ${backupResult.duration ? this.formatDuration(backupResult.duration) : 'N/A'}\n`;
    } else {
      const restoreResult = result as RestoreResult;
      message += `\nSource File: ${restoreResult.sourceFile}\n`;
      message += `Target Database: ${restoreResult.targetDatabase.database}\n`;
      message += `Records Restored: ${restoreResult.recordsRestored || 'N/A'}\n`;
      message += `Duration: ${restoreResult.duration ? this.formatDuration(restoreResult.duration) : 'N/A'}\n`;
    }

    if (result.error) {
      message += `\nError: ${result.error}\n`;
    }

    message += `\n${'='.repeat(50)}`;
    return message;
  }

  generateHtmlMessage(result: BackupResult | RestoreResult): string {
    const isBackup = 'name' in result;
    const type = isBackup ? 'Backup' : 'Restore';
    const statusColor = result.status.includes('failed') ? '#dc3545' : result.status.includes('completed') ? '#28a745' : '#ffc107';

    let html = `<h2>${type} Notification</h2>`;
    html += `<div style="border: 1px solid #ddd; border-radius: 5px; padding: 15px; background-color: #f8f9fa;">`;
    html += `<p><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${result.status.toUpperCase()}</span></p>`;
    html += `<p><strong>Start Time:</strong> ${new Date(result.startTime).toLocaleString()}</p>`;
    html += `<p><strong>End Time:</strong> ${result.endTime ? new Date(result.endTime).toLocaleString() : 'N/A'}</p>`;

    if ('name' in result) {
      const backupResult = result as BackupResult;
      html += `<p><strong>Database:</strong> ${backupResult.name}</p>`;
      html += `<p><strong>File Size:</strong> ${backupResult.fileSize ? this.formatFileSize(backupResult.fileSize) : 'N/A'}</p>`;
      html += `<p><strong>Compression:</strong> ${backupResult.compressionRatio ? backupResult.compressionRatio.toFixed(2) + '%' : 'N/A'}</p>`;
      html += `<p><strong>Records Backed Up:</strong> ${backupResult.recordsBackedUp || 'N/A'}</p>`;
      html += `<p><strong>Duration:</strong> ${backupResult.duration ? this.formatDuration(backupResult.duration) : 'N/A'}</p>`;
    } else {
      const restoreResult = result as RestoreResult;
      html += `<p><strong>Source File:</strong> ${restoreResult.sourceFile}</p>`;
      html += `<p><strong>Target Database:</strong> ${restoreResult.targetDatabase.database}</p>`;
      html += `<p><strong>Records Restored:</strong> ${restoreResult.recordsRestored || 'N/A'}</p>`;
      html += `<p><strong>Duration:</strong> ${restoreResult.duration ? this.formatDuration(restoreResult.duration) : 'N/A'}</p>`;
    }

    if (result.error) {
      html += `<p style="color: #dc3545;"><strong>Error:</strong> ${result.error}</p>`;
    }

    html += `</div>`;
    return html;
  }

  getSubject(result: BackupResult | RestoreResult): string {
    const isBackup = 'name' in result;
    const type = isBackup ? 'Backup' : 'Restore';
    const status = result.status.toUpperCase();
    const name = isBackup ? (result as BackupResult).name : (result as RestoreResult).targetDatabase.database;

    return `[DB Backup Utility] ${type} ${status} - ${name}`;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
