import {expect} from 'chai'

describe('auth:profile', () => {
  // Auth:profile command is a thin wrapper around @hesed/plugin-lib's createAuthProfileCommand.
  // The detailed functionality is tested in plugin-lib's own test suite.
  it('exports the command', async () => {
    const {default: AuthProfile} = await import('../../../../src/commands/mysql/auth/profile.js')

    expect(AuthProfile).to.be.a('function')
  })
})
