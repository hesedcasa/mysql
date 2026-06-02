import {expect} from 'chai'

describe('auth:add', () => {
  // Auth:add command is a thin wrapper around @hesed/plugin-lib's createAuthAddCommand.
  // The detailed auth functionality (profile management, config file handling, etc.) is
  // tested in plugin-lib's own test suite. Here we only test the MySQL-specific integration.
  it('exports correct integration points', async () => {
    const {default: AuthAdd} = await import('../../../../src/commands/mysql/auth/add.js')
    const {closeConnections, testDirectConnection} = await import('../../../../src/mysql/index.js')

    expect(AuthAdd).to.be.a('function')
    expect(closeConnections).to.be.a('function')
    expect(testDirectConnection).to.be.a('function')
  })
})
