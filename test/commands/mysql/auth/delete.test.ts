import {expect} from 'chai'

describe('auth:delete', () => {
  // Auth:delete command is a thin wrapper around @hesed/plugin-lib's createAuthDeleteCommand.
  // The detailed functionality is tested in plugin-lib's own test suite.
  it('exports the command', async () => {
    const {default: AuthDelete} = await import('../../../../src/commands/mysql/auth/delete.js')

    expect(AuthDelete).to.be.a('function')
  })
})
