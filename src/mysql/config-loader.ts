import type {ConnectionOptions as MySQL2ConnectionOptions} from 'mysql2/promise'

export interface DatabaseProfile {
  database: string
  host: string
  password: string
  port: number
  ssl?: boolean
  user: string
}

interface SafetyConfig {
  blacklistedOperations: string[]
  defaultLimit: number
  requireConfirmationFor: string[]
}

export interface MySQLConfig {
  defaultFormat: 'csv' | 'json' | 'table' | 'toon'
  defaultProfile: string
  profiles: Record<string, DatabaseProfile>
  safety: SafetyConfig
}

type MySQLConnectionOptions = Pick<
  MySQL2ConnectionOptions,
  'connectTimeout' | 'database' | 'host' | 'multipleStatements' | 'password' | 'port' | 'ssl' | 'user'
>

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
