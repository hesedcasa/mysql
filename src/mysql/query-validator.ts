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

// Walks the query, yielding each stretch of it alongside the text MySQL would
// actually execute there. Code and quoted runs come through untouched; an
// ordinary comment collapses to a single space, so keyword matching sees
// `DROP /* here */ DATABASE` for what MySQL sees: `DROP DATABASE`.
//
// The scan is quote aware — `--`, `#` and `/*` inside a string literal or a
// quoted identifier are data, not the start of a comment.
//
// A `/*! ... */` version comment keeps its body, because MySQL executes it —
// only the `/*!`, its leading version digits and the closing `*/` become
// whitespace, so `DROP /*!40000 */ DATABASE` reads as `DROP DATABASE` here too.
// MySQL 8.4 consumes a five- or six-digit version (`/*!080411 */` runs), and
// any other digit run it executes as part of the body, where it can only turn
// the statement into a syntax error — so every leading digit goes, whatever the
// server's rule for them is.
// A `/*+ ... */` hint comment goes entirely, like any other comment: its body
// is hint syntax, never SQL MySQL would run.
//
// `quoted` marks a string literal or quoted identifier, so a caller that cares
// about clause structure rather than raw text can blank it out.
function* scanQuery(query: string): Generator<{executable: string; quoted: boolean; start: number}> {
  let index = 0

  while (index < query.length) {
    const char = query[index]

    if (QUOTE_CHARS.has(char)) {
      const end = findQuoteEnd(query, index)
      yield {executable: query.slice(index, end), quoted: true, start: index}
      index = end
      continue
    }

    if (char === '/' && query[index + 1] === '*') {
      const close = query.indexOf('*/', index + 2)
      const end = close === -1 ? query.length : close + 2
      const body = query.slice(index + 3, close === -1 ? query.length : close)
      const versionComment = query[index + 2] === '!'
      yield {executable: versionComment ? ` ${body.replace(/^\d+/u, ' ')} ` : ' ', quoted: false, start: index}
      index = end
      continue
    }

    // `--` only opens a comment when whitespace (or the end of the query)
    // follows it; `a--b` is two minus signs.
    const dashComment = char === '-' && query[index + 1] === '-' && /^\s*$/u.test(query[index + 2] ?? '')

    if (char === '#' || dashComment) {
      const newline = query.indexOf('\n', index)
      yield {executable: ' ', quoted: false, start: index}
      index = newline === -1 ? query.length : newline
      continue
    }

    yield {executable: char, quoted: false, start: index}
    index += 1
  }
}

// Replaces every non-executable MySQL comment with a single space, and every
// string literal or quoted identifier too when `blankQuoted` is set.
function stripComments(query: string, blankQuoted = false): string {
  let stripped = ''

  for (const {executable, quoted} of scanQuery(query)) {
    stripped += blankQuoted && quoted ? ' ' : executable
  }

  return stripped
}

// Index of the `;` that terminates the query's single statement — the last one
// with nothing but whitespace and comments after it — or -1 when the query is
// not terminated. A `;` inside a string literal or a comment is not a
// terminator, because MySQL does not execute it as one.
function findTrailingTerminator(query: string): number {
  let terminator = -1

  for (const {executable, start} of scanQuery(query)) {
    if (executable === ';') {
      terminator = start
    } else if (/\S/u.test(executable)) {
      // Executable text after a `;` means that `;` separated statements rather
      // than ending the query.
      terminator = -1
    }
  }

  return terminator
}

// Strips comments, then trims and upper-cases what is left, giving the checks
// below a single view of the SQL MySQL would actually execute. Quoted text
// stays, so a keyword hidden in a string literal is still visible.
function normalize(query: string): string {
  return stripComments(query).trim().toUpperCase()
}

// The same view with every string literal and quoted identifier blanked out.
// Clause detection asks a structural question — does this statement have a
// WHERE, does it have a LIMIT — and `SELECT 'LIMIT 5' FROM metrics` has neither,
// so keeping the quoted text there would drop the row cap off a query that is
// in fact unbounded. The blacklist and confirmation checks ask the opposite
// question and keep quoted text on purpose.
function normalizeClauses(query: string): string {
  return stripComments(query, true).trim().toUpperCase()
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
  const normalizedQuery = normalizeClauses(query)

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
  const normalizedQuery = normalizeClauses(query)

  if (!normalizedQuery.startsWith('SELECT') || containsOperation(normalizedQuery, 'LIMIT')) {
    return query
  }

  const terminator = findTrailingTerminator(query)

  // On its own line either way: a trailing `-- comment` would otherwise swallow
  // the LIMIT.
  if (terminator === -1) {
    return `${query.trim()}\nLIMIT ${defaultLimit}`
  }

  // The LIMIT has to go in front of the terminator. After it, MySQL reads
  // `LIMIT 100` as a second statement and rejects the whole query.
  return `${query.slice(0, terminator).trim()}\nLIMIT ${defaultLimit}\n${query.slice(terminator).trim()}`
}
