/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('mysql-utils: MySQLUtil', () => {
  let MySQLUtil: any
  let createConnectionStub: SinonStub
  let mockConnection: {end: SinonStub; query: SinonStub}

  const mockConfig = {
    defaultFormat: 'table' as const,
    defaultProfile: 'local',
    profiles: {
      local: {database: 'mydb', host: 'localhost', password: 'secret', port: 3306, user: 'root'},
    },
    safety: {
      blacklistedOperations: ['DROP DATABASE'],
      defaultLimit: 100,
      requireConfirmationFor: ['DELETE', 'UPDATE'],
    },
  }

  beforeEach(async () => {
    mockConnection = {
      end: stub().resolves(),
      query: stub(),
    }
    createConnectionStub = stub().resolves(mockConnection)

    const imported = await esmock('../../src/mysql/mysql-utils.js', {
      'mysql2/promise': {default: {createConnection: createConnectionStub}},
    })
    MySQLUtil = imported.MySQLUtil
  })

  describe('listDatabases', () => {
    it('returns list of databases', async () => {
      mockConnection.query.resolves([[{Database: 'mydb'}, {Database: 'testdb'}], []])

      const util = new MySQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.true
      expect(result.databases).to.deep.equal(['mydb', 'testdb'])
      expect(result.result).to.include('mydb')
    })

    it('returns error on query failure', async () => {
      mockConnection.query.rejects(new Error('Access denied'))

      const util = new MySQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.false
      expect(result.error).to.include('Access denied')
    })
  })

  describe('executeQuery', () => {
    it('blocks blacklisted operations', async () => {
      const util = new MySQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DROP DATABASE mydb')

      expect(result.success).to.be.false
      expect(result.error).to.include('blacklisted')
    })

    it('requires confirmation for destructive operations', async () => {
      const util = new MySQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DELETE FROM users')

      expect(result.success).to.be.false
      expect(result.requiresConfirmation).to.be.true
    })

    it('executes SELECT with auto LIMIT applied', async () => {
      mockConnection.query.resolves([[{id: 1, name: 'Alice'}], [{name: 'id'}, {name: 'name'}]])

      const util = new MySQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'SELECT * FROM users')

      expect(result.success).to.be.true
      expect(result.result).to.include('Rows returned: 1')
    })

    it('skips confirmation when skipConfirmation is true', async () => {
      mockConnection.query.resolves([{affectedRows: 3, insertId: null}, []])

      const util = new MySQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DELETE FROM sessions', 'table', true)

      expect(result.success).to.be.true
      expect(result.result).to.include('Affected rows: 3')
    })
  })

  describe('closeAll', () => {
    it('closes all pooled connections', async () => {
      // eslint-disable-next-line camelcase
      mockConnection.query.resolves([[{current_database: 'mydb', version: '8.0.32'}], []])

      const util = new MySQLUtil(mockConfig)
      await util.testConnection('local') // creates a connection
      await util.closeAll()

      expect(mockConnection.end.calledOnce).to.be.true
    })
  })
})
