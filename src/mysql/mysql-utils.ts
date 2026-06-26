import type {Connection, FieldPacket, OkPacket, RowDataPacket} from 'mysql2/promise'

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
import {FORMATTERS} from './formatters.js'
import {analyzeQuery, applyDefaultLimit, checkBlacklist, getQueryType, requiresConfirmation} from './query-validator.js'

export class MySQLUtil implements DatabaseUtil {
  private config: MySQLConfig
  private connections: Map<string, Promise<Connection>>

  constructor(config: MySQLConfig) {
    this.config = config
    this.connections = new Map()
  }

  async closeAll(): Promise<void> {
    const entries = [...this.connections.values()]
    this.connections.clear()
    await Promise.allSettled(entries.map(async (connPromise) => (await connPromise).end()))
  }

  async describeTable(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<TableStructureResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(`DESCRIBE ${table}`)
      return {
        data: {
          result: this.formatRows(rows as RowDataPacket[], fields as FieldPacket[], format),
          structure: rows as RowDataPacket[],
        },
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
          data: {
            message: `${confirmationCheck.message}\nQuery: ${query}`,
            requiresConfirmation: true,
          },
          success: false,
        }
      }
    }

    // Machine-readable formats must emit only the data payload on stdout, so
    // analysis warnings and status lines are collected as notices instead.
    const machineFormat = format === 'json' || format === 'csv' || format === 'toon'
    const notices: string[] = []

    const warnings = analyzeQuery(query)
    if (warnings.length > 0) {
      notices.push(
        'Query Analysis:\n' +
          warnings.map((w) => `  [${w.level.toUpperCase()}] ${w.message}\n  → ${w.suggestion}`).join('\n'),
      )
    }

    let finalQuery = query
    const queryType = getQueryType(query)
    if (queryType === 'SELECT') {
      finalQuery = applyDefaultLimit(query, this.config.safety.defaultLimit)
      if (finalQuery !== query) {
        notices.push(`Applied default LIMIT ${this.config.safety.defaultLimit}`)
      }
    }

    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(finalQuery)

      const isRead =
        queryType === 'SELECT' || queryType === 'SHOW' || queryType === 'DESCRIBE' || queryType === 'EXPLAIN'
      let data = isRead
        ? this.formatReadResult(rows as RowDataPacket[], fields as FieldPacket[], format, notices)
        : this.formatWriteResult(rows as OkPacket, notices)

      if (format === 'json') {
        data = JSON.parse(data)
      }

      const notice = notices.join('\n\n')
      // For human (table) output everything stays on stdout, exactly as before.
      // For machine formats the data is returned alone and notices go to stderr.
      return {
        data: {
          notices: machineFormat ? notice : undefined,
          result: machineFormat ? data : `${notice}\n\n${data}`,
        },
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

  async explainQuery(
    profileName: string,
    query: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<ExplainResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(`EXPLAIN ${query}`)
      return {
        data: {
          plan: rows as RowDataPacket[],
          result: this.formatRows(rows as RowDataPacket[], fields as FieldPacket[], format),
        },
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

  async listDatabases(profileName: string): Promise<DatabaseListResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows] = await connection.query('SHOW DATABASES')
      const databases = (rows as RowDataPacket[]).map((row) => row.Database as string)
      return {
        data: {
          databases,
          result: `Databases:\n${databases.map((db) => `  • ${db}`).join('\n')}`,
        },
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

  async listTables(profileName: string): Promise<TableListResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows] = await connection.query('SHOW TABLES')

      const rowsArray = rows as RowDataPacket[]
      const tableKey = Object.keys(rowsArray[0])[0]
      const tables = rowsArray.map((row) => row[tableKey] as string)

      return {
        data: {
          result: `Tables in database:\n${tables.map((table) => `  • ${table}`).join('\n')}`,
          tables,
        },
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

  async showIndexes(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<IndexResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows, fields] = await connection.query(`SHOW INDEXES FROM ${table}`)
      return {
        data: {
          indexes: rows as RowDataPacket[],
          result: this.formatRows(rows as RowDataPacket[], fields as FieldPacket[], format),
        },
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

  async testConnection(profileName: string): Promise<ConnectionTestResult> {
    try {
      const connection = await this.getConnection(profileName)
      const [rows] = await connection.query('SELECT VERSION() as version, DATABASE() as current_database')

      const info = (rows as RowDataPacket[])[0]
      return {
        data: {
          database: info.current_database as string,
          result: `Connection successful!\n\nProfile: ${profileName}\nMySQL Version: ${info.version}\nCurrent Database: ${info.current_database}`,
          version: info.version as string,
        },
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

  private formatReadResult(
    rows: RowDataPacket[],
    fields: FieldPacket[],
    format: OutputFormat,
    notices: string[],
  ): string {
    const rowCount = Array.isArray(rows) ? rows.length : 0
    notices.push(`Query executed successfully. Rows returned: ${rowCount}`)
    return this.formatRows(rows, fields, format)
  }

  private formatRows(rows: RowDataPacket[], fields: FieldPacket[], format: OutputFormat): string {
    return FORMATTERS[format](rows, fields)
  }

  private formatWriteResult(rows: OkPacket, notices: string[]): string {
    const affectedRows = rows.affectedRows ?? 0
    const insertId = rows.insertId ?? null
    notices.push('Query executed successfully.')
    let data = `Affected rows: ${affectedRows}\n`
    if (insertId) data += `Insert ID: ${insertId}\n`
    return data
  }

  private async getConnection(profileName: string): Promise<Connection> {
    const existing = this.connections.get(profileName)
    if (existing) {
      try {
        const conn = await existing
        await conn.ping()
        return conn
      } catch {
        this.connections.delete(profileName)
      }
    }

    const connPromise = mysql.createConnection(getMySQLConnectionOptions(this.config, profileName))
    this.connections.set(profileName, connPromise)

    try {
      return await connPromise
    } catch (error) {
      this.connections.delete(profileName)
      throw error
    }
  }
}
