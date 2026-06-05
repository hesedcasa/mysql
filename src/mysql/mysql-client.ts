import type {Config} from '@oclif/core'

import {createProfileManager} from '@hesed/plugin-lib'

import type {DatabaseProfile, MySQLConfig} from './config-loader.js'
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

import {MySQLUtil} from './mysql-utils.js'

let mysqlUtil: MySQLUtil | null = null
let cachedConfig: MySQLConfig | null = null

const DEFAULT_SAFETY_CONFIG = {
  blacklistedOperations: ['DROP DATABASE'],
  defaultLimit: 100,
  requireConfirmationFor: ['DELETE', 'UPDATE', 'DROP', 'TRUNCATE', 'ALTER'],
}

async function initMySQL(config: Config): Promise<MySQLUtil> {
  if (mysqlUtil) return mysqlUtil

  const pm = createProfileManager<DatabaseProfile>(config, undefined, 'mysql-config.json')

  const profiles = await pm.readProfiles()
  if (!profiles) {
    throw new Error(`No profile found.`)
  }

  const defaultProfile = await pm.getDefaultProfile()
  if (!defaultProfile) {
    throw new Error(`Missing default profile.`)
  }

  cachedConfig = {
    defaultFormat: 'table',
    defaultProfile,
    profiles,
    safety: DEFAULT_SAFETY_CONFIG,
  }

  mysqlUtil = new MySQLUtil(cachedConfig)
  return mysqlUtil
}

// eslint-disable-next-line max-params
export async function executeQuery(
  config: Config,
  query: string,
  profile?: string,
  format: OutputFormat = 'table',
  skipConfirmation = false,
): Promise<QueryResult> {
  const profileName = profile ?? cachedConfig?.defaultProfile ?? 'default'

  return (await initMySQL(config)).executeQuery(profileName, query, format, skipConfirmation)
}

export async function listDatabases(config: Config, profile?: string): Promise<DatabaseListResult> {
  const profileName = profile ?? cachedConfig?.defaultProfile ?? 'default'

  return (await initMySQL(config)).listDatabases(profileName)
}

export async function listTables(config: Config, profile?: string): Promise<TableListResult> {
  const profileName = profile ?? cachedConfig?.defaultProfile ?? 'default'

  return (await initMySQL(config)).listTables(profileName)
}

export async function describeTable(
  config: Config,
  table: string,
  profile?: string,
  format: 'json' | 'table' | 'toon' = 'table',
): Promise<TableStructureResult> {
  const profileName = profile ?? cachedConfig?.defaultProfile ?? 'default'

  return (await initMySQL(config)).describeTable(profileName, table, format)
}

export async function showIndexes(
  config: Config,
  table: string,
  profile?: string,
  format: 'json' | 'table' | 'toon' = 'table',
): Promise<IndexResult> {
  const profileName = profile ?? cachedConfig?.defaultProfile ?? 'default'

  return (await initMySQL(config)).showIndexes(profileName, table, format)
}

export async function explainQuery(
  config: Config,
  query: string,
  profile?: string,
  format: 'json' | 'table' | 'toon' = 'table',
): Promise<ExplainResult> {
  const profileName = profile ?? cachedConfig?.defaultProfile ?? 'default'

  return (await initMySQL(config)).explainQuery(profileName, query, format)
}

export async function testDirectConnection(profile: DatabaseProfile): Promise<ConnectionTestResult> {
  const testConfig: MySQLConfig = {
    defaultFormat: 'table',
    defaultProfile: 'default',
    profiles: {default: profile},
    safety: DEFAULT_SAFETY_CONFIG,
  }

  const util = new MySQLUtil(testConfig)
  const result = await util.testConnection('default')
  await util.closeAll()
  return result
}

export async function closeConnections(): Promise<void> {
  if (mysqlUtil) {
    await mysqlUtil.closeAll()
    mysqlUtil = null
    cachedConfig = null
  }
}
