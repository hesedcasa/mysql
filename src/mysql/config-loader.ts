import type {ConnectionOptions as MySQL2ConnectionOptions} from 'mysql2/promise'

import type {DatabaseProfile} from '../config.js'

/**
 * Safety configuration for query execution
 */
interface SafetyConfig {
  blacklistedOperations: string[]
  defaultLimit: number
  requireConfirmationFor: string[]
}

/**
 * Main configuration structure
 */
export interface MySQLConfig {
  defaultFormat: 'csv' | 'json' | 'table' | 'toon'
  defaultProfile: string
  profiles: Record<string, DatabaseProfile>
  safety: SafetyConfig
}

/**
 * MySQL connection options for mysql2 driver
 */
type MySQLConnectionOptions = Pick<
  MySQL2ConnectionOptions,
  'connectTimeout' | 'database' | 'host' | 'multipleStatements' | 'password' | 'port' | 'ssl' | 'user'
>

/**
 * Get MySQL connection options for a specific profile
 *
 * @param config - Configuration object
 * @param profileName - Profile name
 * @returns MySQL connection options
 */
export function getMySQLConnectionOptions(config: MySQLConfig, profileName: string): MySQLConnectionOptions {
  const profile = config.profiles[profileName]

  if (!profile) {
    const availableProfiles = Object.keys(config.profiles).join(', ')
    throw new Error(`Profile "${profileName}" not found. Available profiles: ${availableProfiles}`)
  }

  const options: MySQLConnectionOptions = {
    connectTimeout: 10_000,
    database: profile.database,
    host: profile.host,
    multipleStatements: false,
    password: profile.password,
    port: profile.port,
    user: profile.user,
  }

  if (profile.ssl) {
    options.ssl = {}
  }

  return options
}
