/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('mysql:list-tables', () => {
  let MySQLListTables: any
  let listTablesStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getMySQLConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {result: 'Tables in database:\n  • users\n  • orders', success: true, tables: ['users', 'orders']}

  beforeEach(async () => {
    listTablesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getMySQLConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/mysql/list-tables.js', {
      '../../../src/mysql/index.js': {
        closeConnections: closeConnectionsStub,
        getMySQLConfig: getMySQLConfigStub,
        listTables: listTablesStub,
        setConfigDir: setConfigDirStub,
      },
    })
    MySQLListTables = imported.default
  })

  it('lists tables using default profile and logs result', async () => {
    const cmd = new MySQLListTables([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logJsonStub = stub(cmd, 'logJson')

    await cmd.run()

    expect(getMySQLConfigStub.calledOnce).to.be.true
    expect(listTablesStub.calledOnce).to.be.true
    expect(listTablesStub.firstCall.args[0]).to.equal('local')
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logJsonStub.calledOnce).to.be.true
    expect(logJsonStub.firstCall.args[0]).to.deep.equal(mockResult.tables)
  })

  it('uses provided --profile flag', async () => {
    const cmd = new MySQLListTables(['--profile', 'prod'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'logJson')

    await cmd.run()

    expect(getMySQLConfigStub.called).to.be.false
    expect(listTablesStub.firstCall.args[0]).to.equal('prod')
  })

  it('throws error when listing fails', async () => {
    listTablesStub.resolves({error: 'ERROR: no database selected', success: false})

    const cmd = new MySQLListTables([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    try {
      await cmd.run()
      expect.fail('Should have thrown')
    } catch {
      // expected
    }

    expect(closeConnectionsStub.calledOnce).to.be.true
  })
})
