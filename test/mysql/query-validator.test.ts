import {expect} from 'chai'

import {
  analyzeQuery,
  applyDefaultLimit,
  checkBlacklist,
  getQueryType,
  requiresConfirmation,
} from '../../src/mysql/query-validator.js'

const BLACKLIST = ['DROP DATABASE']
const CONFIRM = ['DELETE', 'UPDATE', 'DROP', 'TRUNCATE', 'ALTER']

describe('query-validator', () => {
  describe('checkBlacklist', () => {
    it('blocks a blacklisted operation', () => {
      const result = checkBlacklist('DROP DATABASE mydb', BLACKLIST)

      expect(result.allowed).to.be.false
      expect(result.reason).to.include('DROP DATABASE')
    })

    it('blocks a blacklisted operation written with extra whitespace', () => {
      expect(checkBlacklist('DROP  DATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP\tDATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP\n  DATABASE mydb', BLACKLIST).allowed).to.be.false
    })

    it('blocks a blacklisted operation separated by a comment', () => {
      // MySQL accepts a comment wherever whitespace is legal.
      expect(checkBlacklist('DROP/**/DATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP /* keep going */ DATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP -- keep going\nDATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP #keep going\nDATABASE mydb', BLACKLIST).allowed).to.be.false
    })

    it('blocks a blacklisted operation inside an executable comment', () => {
      // MySQL runs the body of a /*! ... */ version comment.
      expect(checkBlacklist('/*!40000 DROP DATABASE mydb */', BLACKLIST).allowed).to.be.false
    })

    it('blocks a blacklisted operation separated by an executable comment', () => {
      // MySQL drops the `/*!` and its optional version number before executing,
      // and ignores a hint comment it cannot use, so each of these reaches the
      // server as `DROP DATABASE mydb`.
      expect(checkBlacklist('DROP /*!40000 */ DATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP /*! */ DATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP /*+ MAX_EXECUTION_TIME(1) */ DATABASE mydb', BLACKLIST).allowed).to.be.false
    })

    it('blocks a blacklisted operation separated by a six-digit executable comment', () => {
      // MySQL 8.4 reads a five- OR six-digit version, so it consumes `080411`
      // whole and executes what follows as `DROP DATABASE mydb`.
      expect(checkBlacklist('DROP /*!080411 */ DATABASE mydb', BLACKLIST).allowed).to.be.false
      expect(checkBlacklist('DROP /*!080411*/DATABASE mydb', BLACKLIST).allowed).to.be.false
    })

    it('blocks a blacklisted operation hidden in a string literal', () => {
      // The blacklist keeps quoted text on purpose: a literal can still reach
      // the server as SQL, and over-blocking is the safe direction here.
      expect(checkBlacklist("PREPARE stmt FROM 'DROP DATABASE mydb'", BLACKLIST).allowed).to.be.false
    })

    it('allows a query whose identifier merely contains the operation', () => {
      expect(checkBlacklist('SELECT * FROM drop_database_audit', BLACKLIST).allowed).to.be.true
    })

    it('allows a non-blacklisted query', () => {
      expect(checkBlacklist('SELECT 1', BLACKLIST).allowed).to.be.true
    })
  })

  describe('requiresConfirmation', () => {
    it('requires confirmation for a leading destructive operation', () => {
      expect(requiresConfirmation('DELETE FROM users WHERE id = 1', CONFIRM).required).to.be.true
      expect(requiresConfirmation('truncate table users', CONFIRM).required).to.be.true
    })

    it('requires confirmation when a leading comment pushes the operation onto its own line', () => {
      expect(requiresConfirmation('/* migration 12 */\nALTER TABLE users ADD COLUMN x INT', CONFIRM).required).to.be
        .true
    })

    it('does not require confirmation for a read-only query', () => {
      expect(requiresConfirmation('SELECT * FROM users', CONFIRM).required).to.be.false
    })

    it('does not treat an operation mentioned only in a comment as destructive', () => {
      expect(requiresConfirmation('SELECT 1 -- DELETE FROM users', CONFIRM).required).to.be.false
      expect(requiresConfirmation('SELECT 1 /* TRUNCATE TABLE users */', CONFIRM).required).to.be.false
    })

    it('does not treat a column name containing an operation as destructive', () => {
      expect(requiresConfirmation('SELECT updated_at, deleted_at FROM users', CONFIRM).required).to.be.false
    })
  })

  describe('analyzeQuery', () => {
    const messages = (query: string) => analyzeQuery(query).map((w) => w.message)

    it('warns about an UPDATE with no WHERE clause', () => {
      expect(messages('UPDATE users SET name = 1')).to.include('Missing WHERE clause in UPDATE/DELETE query')
    })

    it('warns about a missing WHERE clause even when a table name contains "where"', () => {
      expect(messages('UPDATE nowhere_stats SET value = 1')).to.include('Missing WHERE clause in UPDATE/DELETE query')
    })

    it('warns about a missing WHERE clause when the only WHERE sits in a comment', () => {
      expect(messages('UPDATE users SET name = 1 /* WHERE id = 1 */')).to.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
    })

    it('does not mistake a comment marker inside a string literal for a comment', () => {
      expect(messages("UPDATE notes SET body = '-- ' WHERE id = 1")).to.not.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
      expect(messages("UPDATE notes SET body = '#' WHERE id = 1")).to.not.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
    })

    it('warns about a missing WHERE clause when the only WHERE sits in a string literal', () => {
      expect(messages("UPDATE notes SET body = 'WHERE id = 1'")).to.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
    })

    it('does not warn when a WHERE clause is present', () => {
      expect(messages('UPDATE users SET name = 1 WHERE id = 2')).to.not.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
    })

    it('warns about a SELECT with no LIMIT even when a column contains "limit"', () => {
      expect(messages('SELECT limit_reached FROM metrics')).to.include('SELECT query without LIMIT')
    })

    it('warns about a SELECT whose only LIMIT sits in a string literal', () => {
      expect(messages("SELECT 'LIMIT 5' FROM metrics")).to.include('SELECT query without LIMIT')
    })

    it('warns about a SELECT whose only LIMIT is a quoted identifier', () => {
      expect(messages('SELECT `limit` FROM metrics')).to.include('SELECT query without LIMIT')
    })

    it('does not warn when a LIMIT is present', () => {
      expect(messages('SELECT id FROM metrics LIMIT 10')).to.not.include('SELECT query without LIMIT')
    })
  })

  describe('applyDefaultLimit', () => {
    it('appends the default limit to an unbounded SELECT', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics', 100)).to.equal('SELECT id FROM metrics\nLIMIT 100')
    })

    it('appends the default limit when a column name contains "limit"', () => {
      expect(applyDefaultLimit('SELECT limit_reached FROM metrics', 100)).to.equal(
        'SELECT limit_reached FROM metrics\nLIMIT 100',
      )
    })

    it('appends the default limit when the only LIMIT sits in a comment', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics /* LIMIT 5 */', 100)).to.equal(
        'SELECT id FROM metrics /* LIMIT 5 */\nLIMIT 100',
      )
    })

    it('appends the default limit when the only LIMIT sits in a string literal', () => {
      expect(applyDefaultLimit("SELECT 'LIMIT 5' FROM metrics", 100)).to.equal(
        "SELECT 'LIMIT 5' FROM metrics\nLIMIT 100",
      )
    })

    it('appends the default limit when the only LIMIT is a quoted identifier', () => {
      expect(applyDefaultLimit('SELECT `limit` FROM metrics', 100)).to.equal('SELECT `limit` FROM metrics\nLIMIT 100')
    })

    it('appends the default limit on its own line so a trailing comment cannot swallow it', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics -- all of them', 100)).to.equal(
        'SELECT id FROM metrics -- all of them\nLIMIT 100',
      )
    })

    it('inserts the default limit before a trailing semicolon', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics;', 100)).to.equal('SELECT id FROM metrics\nLIMIT 100\n;')
    })

    it('inserts the default limit before a semicolon trailed by a comment', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics; -- done', 100)).to.equal(
        'SELECT id FROM metrics\nLIMIT 100\n; -- done',
      )
    })

    it('appends the default limit when the only semicolon is inside a string literal', () => {
      expect(applyDefaultLimit("SELECT ';' FROM metrics", 100)).to.equal("SELECT ';' FROM metrics\nLIMIT 100")
    })

    it('leaves an explicit LIMIT alone', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics LIMIT 5', 100)).to.equal('SELECT id FROM metrics LIMIT 5')
    })

    it('leaves a non-SELECT query alone', () => {
      expect(applyDefaultLimit('UPDATE users SET name = 1', 100)).to.equal('UPDATE users SET name = 1')
    })
  })

  describe('getQueryType', () => {
    it('reports the leading keyword', () => {
      expect(getQueryType('  select 1')).to.equal('SELECT')
      expect(getQueryType('DELETE FROM t')).to.equal('DELETE')
    })

    it('reports UNKNOWN for an unrecognised keyword', () => {
      expect(getQueryType('WITH x AS (SELECT 1) SELECT * FROM x')).to.equal('UNKNOWN')
    })
  })
})
