import {expect} from 'chai'

describe('auth:list', () => {
  // Auth:list command is a thin wrapper around @hesed/plugin-lib's createAuthListCommand.
  // The detailed functionality is tested in plugin-lib's own test suite.
  it('exports the command', async () => {
    const {default: AuthList} = await import('../../../../src/commands/mysql/auth/list.js')

    expect(AuthList).to.be.a('function')
  })
})
