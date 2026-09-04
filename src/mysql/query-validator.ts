type BlacklistCheckResult = {
  allowed: boolean
  reason?: string
}

type ConfirmationCheckResult = {
  message?: string
  required: boolean
}

type QueryWarning = {
  level: 'info' | 'warning'
  message: string
  suggestion: string
}

// Escapes a config-supplied operation so it can be embedded in a pattern.
function escapeForPattern(word: string): string {
  return word.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}

// Tests whether an operation appears in an already-uppercased query as whole
// words, allowing any run of whitespace between the words of a multi-word
// operation ("DROP  DATABASE", "DROP\nDATABASE").
//
// The scan deliberately covers the whole query rather than just the leading
// keyword: a destructive keyword is worth flagging wherever it appears, and a
// leading comment must not be able to hide one. Word boundaries stop the
// reverse mistake, where `nowhere_stats` reads as a WHERE clause or
// `limit_reached` as a LIMIT. A keyword inside a string literal still matches,
// which errs toward asking for confirmation rather than skipping it.
function containsOperation(normalizedQuery: string, operation: string): boolean {
  const pattern = operation
    .trim()
    .split(/\s+/)
    .map((word) => escapeForPattern(word))
    .join(String.raw`\s+`)

  return new RegExp(String.raw`\b${pattern}\b`, 'u').test(normalizedQuery)
}

export function checkBlacklist(query: string, blacklistedOperations: string[]): BlacklistCheckResult {
  const normalizedQuery = query.trim().toUpperCase()

  for (const operation of blacklistedOperations) {
    if (containsOperation(normalizedQuery, operation.toUpperCase())) {
      return {
        allowed: false,
        reason: `Operation "${operation}" is blacklisted and not allowed`,
      }
    }
  }

  return {allowed: true}
}

export function requiresConfirmation(query: string, confirmationOperations: string[]): ConfirmationCheckResult {
  const normalizedQuery = query.trim().toUpperCase()

  for (const operation of confirmationOperations) {
    if (containsOperation(normalizedQuery, operation.toUpperCase())) {
      return {
        message: `This query contains a destructive operation: ${operation}`,
        required: true,
      }
    }
  }

  return {required: false}
}

export function getQueryType(query: string): string {
  const normalizedQuery = query.trim().toUpperCase()
  const firstWord = normalizedQuery.split(/\s+/, 1)[0]

  const knownTypes = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'TRUNCATE',
    'SHOW',
    'DESCRIBE',
    'EXPLAIN',
  ]

  if (knownTypes.includes(firstWord)) {
    return firstWord
  }

  return 'UNKNOWN'
}

export function analyzeQuery(query: string): QueryWarning[] {
  const warnings: QueryWarning[] = []
  const normalizedQuery = query.trim().toUpperCase()

  // Check for missing WHERE clause in UPDATE/DELETE
  if (
    (normalizedQuery.startsWith('UPDATE') || normalizedQuery.startsWith('DELETE')) &&
    !containsOperation(normalizedQuery, 'WHERE')
  ) {
    warnings.push({
      level: 'warning',
      message: 'Missing WHERE clause in UPDATE/DELETE query',
      suggestion: 'This will affect all rows in the table. Add a WHERE clause to limit scope.',
    })
  }

  // Check for SELECT * (potential performance issue)
  if (normalizedQuery.includes('SELECT *')) {
    warnings.push({
      level: 'info',
      message: 'Using SELECT * may impact performance',
      suggestion: 'Consider selecting only the columns you need.',
    })
  }

  // Check for missing LIMIT in SELECT
  if (normalizedQuery.startsWith('SELECT') && !containsOperation(normalizedQuery, 'LIMIT')) {
    warnings.push({
      level: 'info',
      message: 'SELECT query without LIMIT',
      suggestion: 'Consider adding a LIMIT clause to prevent large result sets.',
    })
  }

  return warnings
}

export function applyDefaultLimit(query: string, defaultLimit: number): string {
  const normalizedQuery = query.trim().toUpperCase()

  if (normalizedQuery.startsWith('SELECT') && !containsOperation(normalizedQuery, 'LIMIT')) {
    return `${query.trim()} LIMIT ${defaultLimit}`
  }

  return query
}
