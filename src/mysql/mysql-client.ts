import type {DatabaseProfile} from '../config.js'
import type {MySQLConfig} from './config-loader.js'
import type {
  ConnectionTestResult,
  DatabaseListResult,
  ExplainResult,
  IndexResult,
  OutputFormat,
  QueryResult,
  TableListResult,
  TableStructureResult,
} from './database.js'

import {readConfig} from '../config.js'
import {MySQLUtil} from './mysql-utils.js'

let mysqlUtil: MySQLUtil | null = null
let cachedConfig: MySQLConfig | null = null
let cachedConfigDir: string

/**
 * Set the config directory for the singleton client
 * @param dir - Oclif config directory path
 */
export function setConfigDir(dir: string): void {
  cachedConfigDir = dir
}

/**
 * Initialize (or return cached) MySQLUtil
 */
async function initMySQL(): Promise<MySQLUtil> {
  if (mysqlUtil) return mysqlUtil

  if (!cachedConfigDir) {
    throw new Error('MySQL client not initialized. Call setConfigDir() before running commands.')
  }

  const jsonConfig = await readConfig(cachedConfigDir, console.error)
  if (!jsonConfig) {
    throw new Error('Missing connection config. Run "mq mysql auth add" to create a config.')
  }

  cachedConfig = {
    defaultFormat: 'table',
    defaultProfile: jsonConfig.defaultProfile,
    profiles: jsonConfig.profiles,
    safety: {
      blacklistedOperations: ['DROP DATABASE'],
      defaultLimit: 100,
      requireConfirmationFor: ['DELETE', 'UPDATE', 'DROP', 'TRUNCATE', 'ALTER'],
    },
  }
  mysqlUtil = new MySQLUtil(cachedConfig)
  return mysqlUtil
}

/**
 * Get the loaded MySQL config, initializing if needed
 */
export async function getMySQLConfig(): Promise<MySQLConfig> {
  if (!cachedConfig) {
    await initMySQL()
  }

  return cachedConfig!
}

/**
 * Execute SQL query
 * @param query - SQL query to execute
 * @param profile - Database profile name
 * @param format - Output format
 * @param skipConfirmation - Skip confirmation for destructive operations
 */
export async function executeQuery(
  query: string,
  profile: string,
  format: OutputFormat = 'table',
  skipConfirmation = false,
): Promise<QueryResult> {
  return (await initMySQL()).executeQuery(profile, query, format, skipConfirmation)
}

/**
 * List all databases
 * @param profile - Database profile name
 */
export async function listDatabases(profile: string): Promise<DatabaseListResult> {
  return (await initMySQL()).listDatabases(profile)
}

/**
 * List all tables in current database
 * @param profile - Database profile name
 */
export async function listTables(profile: string): Promise<TableListResult> {
  return (await initMySQL()).listTables(profile)
}

/**
 * Describe table structure
 * @param profile - Database profile name
 * @param table - Table name
 * @param format - Output format
 */
export async function describeTable(
  profile: string,
  table: string,
  format: 'json' | 'table' | 'toon' = 'table',
): Promise<TableStructureResult> {
  return (await initMySQL()).describeTable(profile, table, format)
}

/**
 * Show table indexes
 * @param profile - Database profile name
 * @param table - Table name
 * @param format - Output format
 */
export async function showIndexes(
  profile: string,
  table: string,
  format: 'json' | 'table' | 'toon' = 'table',
): Promise<IndexResult> {
  return (await initMySQL()).showIndexes(profile, table, format)
}

/**
 * Explain query execution plan
 * @param profile - Database profile name
 * @param query - SQL query to explain
 * @param format - Output format
 */
export async function explainQuery(
  profile: string,
  query: string,
  format: 'json' | 'table' | 'toon' = 'table',
): Promise<ExplainResult> {
  return (await initMySQL()).explainQuery(profile, query, format)
}

/**
 * Test a connection directly with profile options (without loading JSON config)
 * @param profile - Database connection profile options
 */
export async function testDirectConnection(profile: DatabaseProfile): Promise<ConnectionTestResult> {
  const tempConfig: MySQLConfig = {
    defaultFormat: 'table',
    defaultProfile: '_auth',
    profiles: {_auth: profile},
    safety: {
      blacklistedOperations: [],
      defaultLimit: 100,
      requireConfirmationFor: [],
    },
  }
  const tempUtil = new MySQLUtil(tempConfig)
  try {
    return await tempUtil.testConnection('_auth')
  } finally {
    await tempUtil.closeAll()
  }
}

/**
 * Close all connections
 */
export async function closeConnections(): Promise<void> {
  if (mysqlUtil) {
    await mysqlUtil.closeAll()
    mysqlUtil = null
    cachedConfig = null
  }
}
