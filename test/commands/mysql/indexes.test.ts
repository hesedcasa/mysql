/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('mysql:indexes', () => {
  let MySQLShowIndexes: any
  let showIndexesStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {indexes: [], result: '┌──────────────┐\n│ PRIMARY (id) │\n└──────────────┘', success: true}

  beforeEach(async () => {
    showIndexesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/mysql/indexes.js', {
      '../../../src/mysql/index.js': {
        closeConnections: closeConnectionsStub,
        showIndexes: showIndexesStub,
      },
    })
    MySQLShowIndexes = imported.default
  })

  it('shows indexes using default profile and logs result', async () => {
    const cmd = new MySQLShowIndexes(['users'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(showIndexesStub.calledOnce).to.be.true
    expect(showIndexesStub.firstCall.args.slice(1)).to.deep.equal(['users', undefined, 'table'])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.result)
  })

  it('uses provided flags', async () => {
    const cmd = new MySQLShowIndexes(['orders', '--profile', 'staging', '--format', 'json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(showIndexesStub.firstCall.args.slice(1)).to.deep.equal(['orders', 'staging', 'json'])
  })

  it('throws error when show indexes fails', async () => {
    showIndexesStub.resolves({error: "ERROR: Table 'mydb.nope' doesn't exist", success: false})

    const cmd = new MySQLShowIndexes(['nope'], {
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
