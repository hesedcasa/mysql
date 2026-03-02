import type {Connection, FieldPacket, OkPacket, RowDataPacket} from 'mysql2/promise'

import {encode} from '@toon-format/toon'
import mysql from 'mysql2/promise'

import type {MySQLConfig} from './config-loader.js'
import type {
  ConnectionTestResult,
  DatabaseListResult,
  DatabaseUtil,
  ExplainResult,
  IndexResult,
  OutputFormat,
  QueryResult,
  TableListResult,
  TableStructureResult,
} from './database.js'

import {getMySQLConnectionOptions} from './config-loader.js'
import {analyzeQuery, applyDefaultLimit, checkBlacklist, getQueryType, requiresConfirmation} from './query-validator.js'

/**
 * MySQL Database Utility
 * Provides core database operations with safety validation and formatting
 */
export class MySQLUtil implements DatabaseUtil {
  private config: MySQLConfig
  private connectionPool: Map<string, Connection>

  constructor(config: MySQLConfig) {
    this.config = config
    this.connectionPool = new Map()
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    await Promise.all([...this.connectionPool.values()].map((conn) => conn.end()))

    this.connectionPool.clear()
  }

  /**
   * Describe table structure
   */
  async describeTable(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<TableStructureResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(`DESCRIBE ${table}`)

      let result = ''
      if (format === 'json') {
        result += this.formatAsJson(rows as RowDataPacket[])
      } else if (format === 'toon') {
        result += this.formatAsToon(rows as RowDataPacket[])
      } else {
        result += this.formatAsTable(rows as RowDataPacket[], fields as FieldPacket[])
      }

      return {
        result,
        structure: rows as RowDataPacket[],
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * Validate and execute a SQL query
   */
  async executeQuery(
    profileName: string,
    query: string,
    format: OutputFormat = 'table',
    skipConfirmation = false,
  ): Promise<QueryResult> {
    const blacklistCheck = checkBlacklist(query, this.config.safety.blacklistedOperations)
    if (!blacklistCheck.allowed) {
      return {
        error: `${blacklistCheck.reason}\n\nThis operation is blocked by safety rules and cannot be executed.`,
        success: false,
      }
    }

    if (!skipConfirmation) {
      const confirmationCheck = requiresConfirmation(query, this.config.safety.requireConfirmationFor)
      if (confirmationCheck.required) {
        return {
          message: `${confirmationCheck.message}\nQuery: ${query}`,
          requiresConfirmation: true,
          success: false,
        }
      }
    }

    const warnings = analyzeQuery(query)
    let warningText = ''
    if (warnings.length > 0) {
      warningText =
        'Query Analysis:\n' +
        warnings.map((w) => `  [${w.level.toUpperCase()}] ${w.message}\n  → ${w.suggestion}`).join('\n') +
        '\n\n'
    }

    let finalQuery = query
    const queryType = getQueryType(query)
    if (queryType === 'SELECT') {
      finalQuery = applyDefaultLimit(query, this.config.safety.defaultLimit)
      if (finalQuery !== query) {
        warningText += `Applied default LIMIT ${this.config.safety.defaultLimit}\n\n`
      }
    }

    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(finalQuery)

      let result = ''
      if (queryType === 'SELECT' || queryType === 'SHOW' || queryType === 'DESCRIBE' || queryType === 'EXPLAIN') {
        result += this.formatSelectResult(rows as RowDataPacket[], fields as FieldPacket[], format)
      } else {
        const okPacket = rows as OkPacket
        const affectedRows = okPacket.affectedRows ?? 0
        const insertId = okPacket.insertId ?? null
        result += `Query executed successfully.\n`
        result += `Affected rows: ${affectedRows}\n`
        if (insertId) {
          result += `Insert ID: ${insertId}\n`
        }
      }

      return {
        result: warningText + result,
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * Explain query execution plan
   */
  async explainQuery(
    profileName: string,
    query: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<ExplainResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(`EXPLAIN ${query}`)

      let result = ''
      if (format === 'json') {
        result += this.formatAsJson(rows as RowDataPacket[])
      } else if (format === 'toon') {
        result += this.formatAsToon(rows as RowDataPacket[])
      } else {
        result += this.formatAsTable(rows as RowDataPacket[], fields as FieldPacket[])
      }

      return {
        plan: rows as RowDataPacket[],
        result,
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * Format query results as CSV
   */
  formatAsCsv(rows: RowDataPacket[], fields: FieldPacket[]): string {
    if (!rows || rows.length === 0) {
      return ''
    }

    const columnNames = fields.map((f) => f.name)
    let csv = columnNames.join(',') + '\n'

    for (const row of rows) {
      const values = columnNames.map((name) => {
        const value = row[name] ?? ''
        const str = String(value)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replaceAll('"', '""') + '"'
        }

        return str
      })
      csv += values.join(',') + '\n'
    }

    return csv
  }

  /**
   * Format query results as JSON
   */
  formatAsJson(rows: RowDataPacket[]): string {
    return JSON.stringify(rows, null, 2)
  }

  /**
   * Format query results as table
   */
  formatAsTable(rows: RowDataPacket[], fields: FieldPacket[]): string {
    if (!rows || rows.length === 0) {
      return 'No results'
    }

    const columnNames = fields.map((f) => f.name)
    const columnWidths = columnNames.map((name) => {
      const dataWidth = Math.max(...rows.map((row) => String(row[name] ?? '').length))
      return Math.max(name.length, dataWidth, 3)
    })

    let table = '┌' + columnWidths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐\n'
    table += '│ ' + columnNames.map((name, i) => name.padEnd(columnWidths[i])).join(' │ ') + ' │\n'
    table += '├' + columnWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤\n'

    for (const row of rows) {
      table +=
        '│ ' +
        columnNames
          .map((name, i) => {
            const value = row[name] ?? 'NULL'
            return String(value).padEnd(columnWidths[i])
          })
          .join(' │ ') +
        ' │\n'
    }

    table += '└' + columnWidths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘'

    return table
  }

  /**
   * Format query results as TOON
   */
  formatAsToon(rows: RowDataPacket[]): string {
    if (!rows || rows.length === 0) {
      return ''
    }

    const serializedRows = rows.map((row) => {
      const serialized: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) {
          serialized[key] = Number.isNaN(value.getTime()) ? null : value.toISOString()
        } else if (Buffer.isBuffer(value)) {
          serialized[key] = value.toString('base64')
        } else {
          serialized[key] = value
        }
      }

      return serialized
    })

    return encode(serializedRows)
  }

  /**
   * List all databases
   */
  async listDatabases(profileName: string): Promise<DatabaseListResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows] = await connection.query('SHOW DATABASES')
      const databases = (rows as RowDataPacket[]).map((row) => row.Database as string)
      return {
        databases,
        result: `Databases:\n${databases.map((db) => `  • ${db}`).join('\n')}`,
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * List all tables in current database
   */
  async listTables(profileName: string): Promise<TableListResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows] = await connection.query('SHOW TABLES')

      const rowsArray = rows as RowDataPacket[]
      const tableKey = Object.keys(rowsArray[0])[0]
      const tables = rowsArray.map((row) => row[tableKey] as string)

      return {
        result: `Tables in database:\n${tables.map((table) => `  • ${table}`).join('\n')}`,
        success: true,
        tables,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * Show table indexes
   */
  async showIndexes(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<IndexResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(`SHOW INDEXES FROM ${table}`)

      let result = ''
      if (format === 'json') {
        result += this.formatAsJson(rows as RowDataPacket[])
      } else if (format === 'toon') {
        result += this.formatAsToon(rows as RowDataPacket[])
      } else {
        result += this.formatAsTable(rows as RowDataPacket[], fields as FieldPacket[])
      }

      return {
        indexes: rows as RowDataPacket[],
        result,
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * Test database connection
   */
  async testConnection(profileName: string): Promise<ConnectionTestResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows] = await connection.query('SELECT VERSION() as version, DATABASE() as current_database')

      const info = (rows as RowDataPacket[])[0]
      return {
        database: info.current_database as string,
        result: `Connection successful!\n\nProfile: ${profileName}\nMySQL Version: ${info.version}\nCurrent Database: ${info.current_database}`,
        success: true,
        version: info.version as string,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  /**
   * Format rows for SELECT/SHOW/DESCRIBE/EXPLAIN query result
   */
  private formatSelectResult(rows: RowDataPacket[], fields: FieldPacket[], format: OutputFormat): string {
    const rowCount = Array.isArray(rows) ? rows.length : 0
    let result = `Query executed successfully. Rows returned: ${rowCount}\n\n`

    switch (format) {
      case 'csv': {
        result += this.formatAsCsv(rows, fields)
        break
      }

      case 'json': {
        result += this.formatAsJson(rows)
        break
      }

      case 'toon': {
        result += this.formatAsToon(rows)
        break
      }

      default: {
        result += this.formatAsTable(rows, fields)
      }
    }

    return result
  }

  /**
   * Get or create MySQL connection for a profile
   */
  private async getConnection(profileName: string): Promise<Connection> {
    if (this.connectionPool.has(profileName)) {
      return this.connectionPool.get(profileName)!
    }

    const options = getMySQLConnectionOptions(this.config, profileName)
    const connection = await mysql.createConnection(options)
    this.connectionPool.set(profileName, connection)

    return connection
  }
}
