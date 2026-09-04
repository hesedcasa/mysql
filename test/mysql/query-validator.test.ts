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

    it('does not warn when a WHERE clause is present', () => {
      expect(messages('UPDATE users SET name = 1 WHERE id = 2')).to.not.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
    })

    it('warns about a SELECT with no LIMIT even when a column contains "limit"', () => {
      expect(messages('SELECT limit_reached FROM metrics')).to.include('SELECT query without LIMIT')
    })

    it('does not warn when a LIMIT is present', () => {
      expect(messages('SELECT id FROM metrics LIMIT 10')).to.not.include('SELECT query without LIMIT')
    })
  })

  describe('applyDefaultLimit', () => {
    it('appends the default limit to an unbounded SELECT', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics', 100)).to.equal('SELECT id FROM metrics LIMIT 100')
    })

    it('appends the default limit when a column name contains "limit"', () => {
      expect(applyDefaultLimit('SELECT limit_reached FROM metrics', 100)).to.equal(
        'SELECT limit_reached FROM metrics LIMIT 100',
      )
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
