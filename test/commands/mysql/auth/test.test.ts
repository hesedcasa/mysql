import {expect} from 'chai'

describe('auth:test', () => {
  // Auth:test command is a thin wrapper around @hesed/plugin-lib's createAuthTestCommand.
  // The detailed functionality is tested in plugin-lib's own test suite.
  // Here we only test the MySQL-specific integration points.
  it('exports correct integration points', async () => {
    const {default: AuthTest} = await import('../../../../src/commands/mysql/auth/test.js')
    const {closeConnections, testDirectConnection} = await import('../../../../src/mysql/index.js')

    expect(AuthTest).to.be.a('function')
    expect(closeConnections).to.be.a('function')
    expect(testDirectConnection).to.be.a('function')
  })
})
