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

// String literals ('...', "...") and quoted identifiers (`...`).
const QUOTE_CHARS = new Set(['"', "'", '`'])

// Returns the index just past the quoted run that starts at `start`, so the
// caller can copy a string literal or quoted identifier through untouched. An
// unterminated quote swallows the rest of the query, which keeps any keyword it
// hides visible to the safety checks.
function findQuoteEnd(query: string, start: number): number {
  const quote = query[start]

  for (let index = start + 1; index < query.length; index += 1) {
    // Backslash escapes apply inside string literals but not inside `identifiers`.
    if (quote !== '`' && query[index] === '\\') {
      index += 1
      continue
    }

    if (query[index] === quote) {
      // A doubled quote is an escaped quote, not the end of the run.
      if (query[index + 1] === quote) {
        index += 1
        continue
      }

      return index + 1
    }
  }

  return query.length
}

// Replaces every non-executable MySQL comment with a single space, so keyword
// matching sees `DROP /* here */ DATABASE` for what MySQL sees: `DROP DATABASE`.
// The scan is quote aware — `--`, `#` and `/*` inside a string literal or a
// quoted identifier are data, not the start of a comment.
//
// `/*! ... */` and `/*+ ... */` keep their bodies: MySQL executes version
// comments and reads optimizer hints, so their contents are real SQL.
function stripComments(query: string): string {
  let stripped = ''
  let index = 0

  while (index < query.length) {
    const char = query[index]

    if (QUOTE_CHARS.has(char)) {
      const end = findQuoteEnd(query, index)
      stripped += query.slice(index, end)
      index = end
      continue
    }

    if (char === '/' && query[index + 1] === '*') {
      const executable = query[index + 2] === '!' || query[index + 2] === '+'
      const close = query.indexOf('*/', index + 2)
      const end = close === -1 ? query.length : close + 2
      stripped += executable ? query.slice(index, end) : ' '
      index = end
      continue
    }

    // `--` only opens a comment when whitespace (or the end of the query)
    // follows it; `a--b` is two minus signs.
    const dashComment = char === '-' && query[index + 1] === '-' && /^\s*$/u.test(query[index + 2] ?? '')

    if (char === '#' || dashComment) {
      const newline = query.indexOf('\n', index)
      stripped += ' '
      index = newline === -1 ? query.length : newline
      continue
    }

    stripped += char
    index += 1
  }

  return stripped
}

// Strips comments, then trims and upper-cases what is left, giving the checks
// below a single view of the SQL MySQL would actually execute.
function normalize(query: string): string {
  return stripComments(query).trim().toUpperCase()
}

// Tests whether an operation appears in an already-normalized query as whole
// words, allowing any run of whitespace between the words of a multi-word
// operation ("DROP  DATABASE", "DROP\nDATABASE"). Comments are gone by this
// point, so a comment between those words no longer hides the operation.
//
// The scan deliberately covers the whole query rather than just the leading
// keyword: a destructive keyword is worth flagging wherever it appears. Word
// boundaries stop the reverse mistake, where `nowhere_stats` reads as a WHERE
// clause or `limit_reached` as a LIMIT. A keyword inside a string literal still
// matches, which errs toward asking for confirmation rather than skipping it —
// and keeps `PREPARE s FROM 'DROP DATABASE x'` in reach of the blacklist.
function containsOperation(normalizedQuery: string, operation: string): boolean {
  const pattern = operation
    .trim()
    .split(/\s+/)
    .map((word) => escapeForPattern(word))
    .join(String.raw`\s+`)

  return new RegExp(String.raw`\b${pattern}\b`, 'u').test(normalizedQuery)
}

export function checkBlacklist(query: string, blacklistedOperations: string[]): BlacklistCheckResult {
  const normalizedQuery = normalize(query)

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
  const normalizedQuery = normalize(query)

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
  const normalizedQuery = normalize(query)
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
  const normalizedQuery = normalize(query)

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
  const normalizedQuery = normalize(query)

  if (normalizedQuery.startsWith('SELECT') && !containsOperation(normalizedQuery, 'LIMIT')) {
    // On its own line: a trailing `-- comment` would otherwise swallow it.
    return `${query.trim()}\nLIMIT ${defaultLimit}`
  }

  return query
}
