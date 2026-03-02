export type {MySQLJsonConfig} from '../config.js'
export type {ConnectionTestResult} from './database.js'
export {
  closeConnections,
  describeTable,
  executeQuery,
  explainQuery,
  getMySQLConfig,
  listDatabases,
  listTables,
  setConfigDir,
  showIndexes,
  testDirectConnection,
} from './mysql-client.js'
