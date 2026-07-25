import { MongoClient, Db } from 'mongodb';
import { Connector, ConnectionConfig, DatabaseStats } from '../types';

export class MongoDBConnector implements Connector {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const host = config.host || 'localhost';
    const port = config.port || 27017;
    const url = `mongodb://${config.username}:${config.password}@${host}:${port}/${config.database}`;

    this.client = new MongoClient(url, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    await this.client.connect();
    this.db = this.client.db(config.database);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const tempClient = new MongoClient(
        `mongodb://${config.username}:${config.password}@${config.host || 'localhost'}:${config.port || 27017}/${config.database}`,
      );
      await tempClient.connect();
      await tempClient.db().command({ ping: 1 });
      await tempClient.close();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    return [];
  }

  async getCollections(): Promise<string[]> {
    if (!this.db) throw new Error('Not connected to database');

    const collections = await this.db.listCollections().toArray();
    return collections.map((col) => col.name);
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.db) throw new Error('Not connected to database');

    const collections = await this.getCollections();

    let totalRecords = 0;
    let totalSize = 0;

    for (const collectionName of collections) {
      const collection = this.db!.collection(collectionName);
      const count = await collection.countDocuments();
      totalRecords += count;

      const stats = await this.db!.command({
        collStats: 1,
        collection: collectionName,
      });
      totalSize += (stats.size || 0) + (stats.storageSize || 0);
    }

    return {
      collections,
      totalRecords,
      totalSize,
    };
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error('Not connected to database');

    const buildInfo = await this.client.db().command({ buildInfo: 1 });

    return {
      type: 'mongodb',
      version: buildInfo.version,
    };
  }
}
