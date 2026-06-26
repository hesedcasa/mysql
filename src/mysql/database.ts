import type {ApiResult} from '@hesed/plugin-lib'

export type OutputFormat = 'csv' | 'json' | 'table' | 'toon'

export interface QueryData {
  message?: string
  notices?: string
  requiresConfirmation?: boolean
  result?: string
}

export interface DatabaseListData {
  databases: string[]
  result?: string
}

export interface TableListData {
  result?: string
  tables: string[]
}

export interface TableStructureData {
  result?: string
  structure: Record<string, unknown>[]
}

export interface IndexData {
  indexes: Record<string, unknown>[]
  result?: string
}

export interface ExplainData {
  plan: Record<string, unknown>[]
  result?: string
}

interface ConnectionTestData {
  database: string
  result?: string
  version: string
}

export type QueryResult = ApiResult & {data?: QueryData}
export type DatabaseListResult = ApiResult & {data?: DatabaseListData}
export type TableListResult = ApiResult & {data?: TableListData}
export type TableStructureResult = ApiResult & {data?: TableStructureData}
export type IndexResult = ApiResult & {data?: IndexData}
export type ExplainResult = ApiResult & {data?: ExplainData}
export type ConnectionTestResult = ApiResult & {data?: ConnectionTestData}

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
