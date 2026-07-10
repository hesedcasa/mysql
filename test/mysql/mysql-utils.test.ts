/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

const flushMicrotasks = async () =>
  new Promise((resolve) => {
    setImmediate(resolve)
  })

describe('mysql-utils: MySQLUtil', () => {
  let MySQLUtil: any
  let createPoolStub: SinonStub
  let mockPool: {end: SinonStub; query: SinonStub}

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
    mockPool = {
      end: stub().resolves(),
      query: stub(),
    }
    createPoolStub = stub().returns(mockPool)

    const imported = await esmock('../../src/mysql/mysql-utils.js', {
      'mysql2/promise': {default: {createPool: createPoolStub}},
    })
    MySQLUtil = imported.MySQLUtil
  })

  describe('listDatabases', () => {
    it('returns list of databases', async () => {
      mockPool.query.resolves([[{Database: 'mydb'}, {Database: 'testdb'}], []])

      const util = new MySQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.true
      expect(result.data?.databases).to.deep.equal(['mydb', 'testdb'])
      expect(result.data?.result).to.include('mydb')
    })

    it('returns error on query failure', async () => {
      mockPool.query.rejects(new Error('Access denied'))

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
      expect(result.data?.requiresConfirmation).to.be.true
    })

    it('executes SELECT with auto LIMIT applied', async () => {
      mockPool.query.resolves([[{id: 1, name: 'Alice'}], [{name: 'id'}, {name: 'name'}]])

      const util = new MySQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'SELECT * FROM users')

      expect(result.success).to.be.true
      expect(result.data?.result).to.include('Rows returned: 1')
    })

    it('skips confirmation when skipConfirmation is true', async () => {
      mockPool.query.resolves([{affectedRows: 3, insertId: null}, []])

      const util = new MySQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DELETE FROM sessions', 'table', true)

      expect(result.success).to.be.true
      expect(result.data?.result).to.include('Affected rows: 3')
    })
  })

  describe('concurrency limit', () => {
    const limitedConfig = {
      ...mockConfig,
      safety: {...mockConfig.safety, maxConcurrentQueries: 2},
    }

    it('sizes the connection pool to the effective query limit', async () => {
      mockPool.query.resolves([[{Database: 'mydb'}], []])

      const util = new MySQLUtil(limitedConfig)
      await util.listDatabases('local')

      expect(createPoolStub.calledOnce).to.be.true
      expect(createPoolStub.firstCall.args[0].connectionLimit).to.equal(2)
    })

    it('queues queries beyond the limit until a running query finishes', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const util = new MySQLUtil(limitedConfig)
      const first = util.listDatabases('local')
      const second = util.listDatabases('local')
      const third = util.listDatabases('local')

      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(2)

      resolvers[0]([[{Database: 'mydb'}], []])
      await first
      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(3)

      resolvers[1]([[{Database: 'mydb'}], []])
      resolvers[2]([[{Database: 'mydb'}], []])
      const [secondResult, thirdResult] = await Promise.all([second, third])
      expect(secondResult.success).to.be.true
      expect(thirdResult.success).to.be.true
    })

    it('frees the slot when a query fails so waiting queries still run', async () => {
      mockPool.query.onFirstCall().rejects(new Error('boom'))
      mockPool.query.onSecondCall().resolves([[{Database: 'mydb'}], []])

      const util = new MySQLUtil({...mockConfig, safety: {...mockConfig.safety, maxConcurrentQueries: 1}})
      const [failed, succeeded] = await Promise.all([util.listDatabases('local'), util.listDatabases('local')])

      expect(failed.success).to.be.false
      expect(failed.error).to.include('boom')
      expect(succeeded.success).to.be.true
    })

    it('rejects queued queries when closeAll is called', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const util = new MySQLUtil({...mockConfig, safety: {...mockConfig.safety, maxConcurrentQueries: 1}})
      const running = util.listDatabases('local')
      const queued = util.listDatabases('local')

      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(1)

      await util.closeAll()

      const queuedResult = await queued
      expect(queuedResult.success).to.be.false
      expect(queuedResult.error).to.include('closed while the query was waiting')

      resolvers[0]([[{Database: 'mydb'}], []])
      const runningResult = await running
      expect(runningResult.success).to.be.true
    })

    it('fails a queued query that waits longer than queryQueueTimeoutMs', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const util = new MySQLUtil({
        ...mockConfig,
        safety: {...mockConfig.safety, maxConcurrentQueries: 1, queryQueueTimeoutMs: 20},
      })
      const running = util.listDatabases('local')
      const queued = util.listDatabases('local')

      const queuedResult = await queued
      expect(queuedResult.success).to.be.false
      expect(queuedResult.error).to.include('Timed out after 0.02s waiting for a free query slot')

      // The slot itself is unaffected: the running query still completes,
      // and its release must not grant a slot to the timed-out waiter.
      resolvers[0]([[{Database: 'mydb'}], []])
      const runningResult = await running
      expect(runningResult.success).to.be.true

      // A fresh query can still acquire the freed slot afterwards.
      const after = util.listDatabases('local')
      await flushMicrotasks()
      resolvers[1]([[{Database: 'mydb'}], []])
      const afterResult = await after
      expect(afterResult.success).to.be.true
    })

    it('prefers the profile-level queryQueueTimeoutMs over the safety default', async () => {
      mockPool.query.callsFake(async () => new Promise(() => {})) // never resolves

      // Safety allows a long wait, but the profile times out almost immediately.
      const util = new MySQLUtil({
        ...mockConfig,
        profiles: {
          local: {...mockConfig.profiles.local, maxConcurrentQueries: 1, queryQueueTimeoutMs: 20},
        },
        safety: {...mockConfig.safety, queryQueueTimeoutMs: 60_000},
      })
      void util.listDatabases('local')
      const queued = await util.listDatabases('local')

      expect(queued.success).to.be.false
      expect(queued.error).to.include('Timed out after 0.02s')
    })

    it('prefers the profile-level maxConcurrentQueries over the safety default', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      // Safety allows 2, but the profile itself only allows 1.
      const config = {
        ...limitedConfig,
        profiles: {
          local: {...limitedConfig.profiles.local, maxConcurrentQueries: 1},
        },
      }
      const util = new MySQLUtil(config)
      const first = util.listDatabases('local')
      const second = util.listDatabases('local')

      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(1)

      resolvers[0]([[{Database: 'mydb'}], []])
      await first
      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(2)

      resolvers[1]([[{Database: 'mydb'}], []])
      await second
    })

    it('tracks limits per profile independently', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const config = {
        ...limitedConfig,
        profiles: {
          ...limitedConfig.profiles,
          other: {database: 'otherdb', host: 'localhost', password: 'secret', port: 3306, user: 'root'},
        },
        safety: {...limitedConfig.safety, maxConcurrentQueries: 1},
      }
      const util = new MySQLUtil(config)
      const local1 = util.listDatabases('local')
      const local2 = util.listDatabases('local')
      const other = util.listDatabases('other')

      await flushMicrotasks()
      // One slot per profile: local1 and other run, local2 waits.
      expect(mockPool.query.callCount).to.equal(2)

      for (const resolve of resolvers) resolve([[{Database: 'mydb'}], []])
      await Promise.all([local1, other])
      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(3)

      resolvers[2]([[{Database: 'mydb'}], []])
      await local2
    })
  })

  describe('closeAll', () => {
    it('closes all pooled connections', async () => {
      // eslint-disable-next-line camelcase
      mockPool.query.resolves([[{current_database: 'mydb', version: '8.0.32'}], []])

      const util = new MySQLUtil(mockConfig)
      await util.testConnection('local') // creates a connection
      await util.closeAll()

      expect(mockPool.end.calledOnce).to.be.true
    })
  })
})
