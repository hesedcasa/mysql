import {expect} from 'chai'

describe('auth:update', () => {
  // Auth:update command is a thin wrapper around @hesed/plugin-lib's createAuthUpdateCommand.
  // The detailed auth functionality is tested in plugin-lib's own test suite.
  // Here we only test the MySQL-specific integration points.
  it('exports correct integration points', async () => {
    const {default: AuthUpdate} = await import('../../../../src/commands/mysql/auth/update.js')
    const {closeConnections, testDirectConnection} = await import('../../../../src/mysql/index.js')

    expect(AuthUpdate).to.be.a('function')
    expect(closeConnections).to.be.a('function')
    expect(testDirectConnection).to.be.a('function')
  })
})
