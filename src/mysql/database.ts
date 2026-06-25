export interface QueryResult {
  error?: string
  message?: string
  // Human-facing chatter (analysis warnings, row counts) kept separate from
  // `result` so machine-readable formats can emit only the data payload.
  notices?: string
  requiresConfirmation?: boolean
  result?: string
  success: boolean
}

export interface DatabaseListResult {
  databases?: string[]
  error?: string
  result?: string
  success: boolean
}

export interface TableListResult {
  error?: string
  result?: string
  success: boolean
  tables?: string[]
}

export interface TableStructureResult {
  error?: string
  result?: string
  structure?: Record<string, unknown>[]
  success: boolean
}

export interface IndexResult {
  error?: string
  indexes?: Record<string, unknown>[]
  result?: string
  success: boolean
}

export interface ExplainResult {
  error?: string
  plan?: Record<string, unknown>[]
  result?: string
  success: boolean
}

export interface ConnectionTestResult {
  database?: string
  error?: string
  result?: string
  success: boolean
  version?: string
}

export type OutputFormat = 'csv' | 'json' | 'table' | 'toon'

export interface DatabaseUtil {
  closeAll(): Promise<void>
  describeTable(profileName: string, table: string, format?: OutputFormat): Promise<TableStructureResult>
  executeQuery(
    profileName: string,
    query: string,
    format?: OutputFormat,
    skipConfirmation?: boolean,
  ): Promise<QueryResult>
  explainQuery(profileName: string, query: string, format?: OutputFormat): Promise<ExplainResult>
  listDatabases(profileName: string): Promise<DatabaseListResult>
  listTables(profileName: string): Promise<TableListResult>
  showIndexes(profileName: string, table: string, format?: OutputFormat): Promise<IndexResult>
}
