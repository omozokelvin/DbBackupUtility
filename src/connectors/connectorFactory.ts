import { Connector, ConnectionConfig, DatabaseType } from '../types';
import { MySQLConnector } from './mysqlConnector';
import { PostgreSQLConnector } from './postgresConnector';
import { MongoDBConnector } from './mongoConnector';
import { SQLiteConnector } from './sqliteConnector';

export class ConnectorFactory {
  static createConnector(type: DatabaseType): Connector {
    switch (type) {
      case 'mysql':
        return new MySQLConnector();
      case 'postgresql':
        return new PostgreSQLConnector();
      case 'mongodb':
        return new MongoDBConnector();
      case 'sqlite':
        return new SQLiteConnector();
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }
}
