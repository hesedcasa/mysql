/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('mysql:list-databases', () => {
  let MySQLListDatabases: any
  let listDatabasesStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getMySQLConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {databases: ['mydb', 'testdb'], result: 'Databases:\n  • mydb\n  • testdb', success: true}

  beforeEach(async () => {
    listDatabasesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getMySQLConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/mysql/list-databases.js', {
      '../../../src/mysql/index.js': {
        closeConnections: closeConnectionsStub,
        getMySQLConfig: getMySQLConfigStub,
        listDatabases: listDatabasesStub,
        setConfigDir: setConfigDirStub,
      },
    })
    MySQLListDatabases = imported.default
  })

  it('lists databases using default profile and logs result', async () => {
    const cmd = new MySQLListDatabases([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logJsonStub = stub(cmd, 'logJson')

    await cmd.run()

    expect(getMySQLConfigStub.calledOnce).to.be.true
    expect(listDatabasesStub.calledOnce).to.be.true
    expect(listDatabasesStub.firstCall.args[0]).to.equal('local')
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logJsonStub.calledOnce).to.be.true
    expect(logJsonStub.firstCall.args[0]).to.deep.equal(mockResult.databases)
  })

  it('uses provided --profile flag', async () => {
    const cmd = new MySQLListDatabases(['--profile', 'staging'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'logJson')

    await cmd.run()

    expect(getMySQLConfigStub.called).to.be.false
    expect(listDatabasesStub.firstCall.args[0]).to.equal('staging')
  })

  it('throws error when listing fails', async () => {
    listDatabasesStub.resolves({error: 'ERROR: access denied', success: false})

    const cmd = new MySQLListDatabases([], {
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
