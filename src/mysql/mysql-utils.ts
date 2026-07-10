import type {FieldPacket, OkPacket, Pool, RowDataPacket} from 'mysql2/promise'

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

const DEFAULT_MAX_CONCURRENT_QUERIES = 5
const DEFAULT_QUEUE_TIMEOUT_MS = 30_000

interface QueryWaiter {
  grant: () => void
  reject: (error: Error) => void
}

interface QuerySlotState {
  active: number
  waiting: QueryWaiter[]
}

export class MySQLUtil implements DatabaseUtil {
  private config: MySQLConfig
  private pools: Map<string, Pool>
  private querySlots: Map<string, QuerySlotState>

  constructor(config: MySQLConfig) {
    this.config = config
    this.pools = new Map()
    this.querySlots = new Map()
  }

  async closeAll(): Promise<void> {
    // Reject queued queries first so nothing waits forever on a closed util.
    for (const slot of this.querySlots.values()) {
      for (const waiter of slot.waiting.splice(0)) {
        waiter.reject(new Error('Connections were closed while the query was waiting for a free slot'))
      }
    }

    this.querySlots.clear()

    const pools = [...this.pools.values()]
    this.pools.clear()
    await Promise.allSettled(pools.map((pool) => pool.end()))
  }

  async describeTable(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<TableStructureResult> {
    try {
      const [rows, fields] = await this.runQuery(profileName, `DESCRIBE ${table}`)
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
      const [rows, fields] = await this.runQuery(profileName, finalQuery)

      const isRead =
        queryType === 'SELECT' || queryType === 'SHOW' || queryType === 'DESCRIBE' || queryType === 'EXPLAIN'
      let data = isRead
        ? this.formatReadResult(rows as RowDataPacket[], fields as FieldPacket[], format, notices)
        : this.formatWriteResult(rows as OkPacket, notices, format)

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
      const [rows, fields] = await this.runQuery(profileName, `EXPLAIN ${query}`)
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
      const [rows] = await this.runQuery(profileName, 'SHOW DATABASES')
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
      const [rows] = await this.runQuery(profileName, 'SHOW TABLES')

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
      const [rows, fields] = await this.runQuery(profileName, `SHOW INDEXES FROM ${table}`)
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
      const [rows] = await this.runQuery(profileName, 'SELECT VERSION() as version, DATABASE() as current_database')

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

  // Grants a query slot for the profile, or waits until one frees up. The
  // returned release callback must be invoked exactly once per acquisition.
  private acquireQuerySlot(profileName: string): Promise<() => void> {
    const limit = this.getQueryLimit(profileName)
    let slot = this.querySlots.get(profileName)
    if (!slot) {
      slot = {active: 0, waiting: []}
      this.querySlots.set(profileName, slot)
    }

    const state = slot
    const release = () => {
      const next = state.waiting.shift()
      if (next) {
        next.grant()
      } else {
        state.active -= 1
      }
    }

    if (state.active < limit) {
      state.active += 1
      return Promise.resolve(release)
    }

    const timeoutMs = this.config.safety.queryQueueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS
    process.stderr.write(`Waiting for a free query slot (${limit}/${limit} in use for profile "${profileName}")...\n`)

    return new Promise((resolve, reject) => {
      const waiter: QueryWaiter = {
        grant() {
          clearTimeout(timer)
          resolve(release)
        },
        reject(error: Error) {
          clearTimeout(timer)
          reject(error)
        },
      }
      const timer = setTimeout(() => {
        const index = state.waiting.indexOf(waiter)
        if (index !== -1) state.waiting.splice(index, 1)
        reject(
          new Error(
            `Timed out after ${timeoutMs / 1000}s waiting for a free query slot ` +
              `(limit: ${limit} concurrent queries for profile "${profileName}")`,
          ),
        )
      }, timeoutMs)
      // Don't let a pending queue timer keep the CLI process alive.
      timer.unref?.()
      state.waiting.push(waiter)
    })
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

  private formatWriteResult(rows: OkPacket, notices: string[], format: OutputFormat): string {
    const affectedRows = rows.affectedRows ?? 0
    const insertId = rows.insertId ?? null
    notices.push('Query executed successfully.')

    // The caller JSON.parses the result for json output, so emit valid JSON
    // here rather than the human-readable string (which would throw on parse).
    if (format === 'json') {
      const payload: {affectedRows: number; insertId?: number} = {affectedRows}
      if (insertId) payload.insertId = insertId
      return JSON.stringify(payload, null, 2)
    }

    let data = `Affected rows: ${affectedRows}\n`
    if (insertId) data += `Insert ID: ${insertId}\n`
    return data
  }

  // The pool is sized to the profile's query limit so slot holders each get a
  // real physical connection — a single Connection would serialize commands on
  // the wire and make the concurrency limit meaningless.
  private getPool(profileName: string): Pool {
    const existing = this.pools.get(profileName)
    if (existing) return existing

    const pool = mysql.createPool({
      ...getMySQLConnectionOptions(this.config, profileName),
      connectionLimit: this.getQueryLimit(profileName),
      waitForConnections: true,
    })
    this.pools.set(profileName, pool)
    return pool
  }

  private getQueryLimit(profileName: string): number {
    const configuredLimit =
      this.config.profiles[profileName]?.maxConcurrentQueries ??
      this.config.safety.maxConcurrentQueries ??
      DEFAULT_MAX_CONCURRENT_QUERIES
    // A limit below 1 would leave every query waiting forever.
    return Math.max(1, configuredLimit)
  }

  // All queries go through here so concurrent load on the same profile is
  // capped at maxConcurrentQueries; excess queries wait for a free slot.
  private async runQuery(profileName: string, sql: string): Promise<[OkPacket | RowDataPacket[], FieldPacket[]]> {
    const release = await this.acquireQuerySlot(profileName)
    try {
      return (await this.getPool(profileName).query(sql)) as [OkPacket | RowDataPacket[], FieldPacket[]]
    } finally {
      release()
    }
  }
}
