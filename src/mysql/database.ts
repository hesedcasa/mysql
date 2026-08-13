import type {ApiResult} from '@hesed/plugin-lib'

export type OutputFormat = 'csv' | 'json' | 'table' | 'toon'

export type QueryData = {
  message?: string
  notices?: string
  requiresConfirmation?: boolean
  // For machine formats (json), result is the parsed payload (object/array);
  // for human output it is a formatted string. Typed as unknown to cover both.
  result?: unknown
}

export type DatabaseListData = {
  databases: string[]
  result?: string
}

export type TableListData = {
  result?: string
  tables: string[]
}

export type TableStructureData = {
  result?: string
  structure: Array<Record<string, unknown>>
}

export type IndexData = {
  indexes: Array<Record<string, unknown>>
  result?: string
}

export type ExplainData = {
  plan: Array<Record<string, unknown>>
  result?: string
}

type ConnectionTestData = {
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

export type DatabaseUtil = {
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
