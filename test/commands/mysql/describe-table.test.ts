/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('mysql:describe-table', () => {
  let MySQLDescribeTable: any
  let describeTableStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getMySQLConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {result: '┌─────┬──────┐\n│ id  │ name │\n└─────┴──────┘', structure: [], success: true}

  beforeEach(async () => {
    describeTableStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getMySQLConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/mysql/describe-table.js', {
      '../../../src/mysql/index.js': {
        closeConnections: closeConnectionsStub,
        describeTable: describeTableStub,
        getMySQLConfig: getMySQLConfigStub,
        setConfigDir: setConfigDirStub,
      },
    })
    MySQLDescribeTable = imported.default
  })

  it('describes table using default profile and logs result', async () => {
    const cmd = new MySQLDescribeTable(['--table', 'users'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(getMySQLConfigStub.calledOnce).to.be.true
    expect(describeTableStub.calledOnce).to.be.true
    expect(describeTableStub.firstCall.args).to.deep.equal(['local', 'users', 'table'])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.result)
  })

  it('uses provided flags', async () => {
    const cmd = new MySQLDescribeTable(['--table', 'orders', '--profile', 'prod', '--format', 'json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(getMySQLConfigStub.called).to.be.false
    expect(describeTableStub.firstCall.args).to.deep.equal(['prod', 'orders', 'json'])
  })

  it('throws error when describe fails', async () => {
    describeTableStub.resolves({error: "ERROR: Table 'mydb.nope' doesn't exist", success: false})

    const cmd = new MySQLDescribeTable(['--table', 'nope'], {
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
