import {expect} from 'chai'

import {createConfigDir, removeConfigDir, runCli, runCliJson, runCliOk} from './helpers.js'

describe('e2e: connection and profiles', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('connects with the default profile', async () => {
    const payload = await runCliJson<{data: {database: string; version: string}; success: boolean}>(
      ['mysql', 'auth', 'test'],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.database).to.equal('mq_e2e')
    expect(payload.data.version).to.match(/^8\.4\./u)
  })

  it('lists the configured profiles', async () => {
    const payload = await runCliJson<{data: Array<{default?: boolean; name: string}>}>(
      ['mysql', 'auth', 'list'],
      configDir,
    )

    const names = payload.data.map((p) => p.name)
    expect(names).to.have.members(['default', 'alt', 'broken', 'empty'])
    expect(payload.data.find((p) => p.default)?.name).to.equal('default')
  })

  it('reports a failed auth test on bad credentials', async () => {
    const {code, stderr} = await runCli(['mysql', 'auth', 'test', '-p', 'broken'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr).to.include('Authenticating connection... \u{2717} failed')
    expect(stderr).to.include('Failed to connect to MySQL.')
  })

  it('surfaces the driver error when a query uses bad credentials', async () => {
    const {code, stderr} = await runCli(['mysql', 'tables', '-p', 'broken'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr.replaceAll(/\s+/gu, ' ')).to.match(/Access denied for user 'root'/iu)
    expect(stderr).to.not.include('Error: ERROR:')
  })

  it('fails when the config dir holds no profiles', async () => {
    const {code, stderr} = await runCli(['mysql', 'tables'], '/nonexistent-mq-config-dir')

    expect(code).to.not.equal(0)
    expect(stderr).to.match(/profile/iu)
  })

  it('lists every database on the server', async () => {
    const payload = await runCliJson<{data: {databases: string[]}}>(['mysql', 'databases'], configDir)

    expect(payload.data.databases).to.include.members(['mq_e2e', 'mq_e2e_alt', 'information_schema'])
  })

  it('honours --profile when selecting the schema', async () => {
    const defaults = await runCliJson<{data: {tables: string[]}}>(['mysql', 'tables'], configDir)
    const alt = await runCliJson<{data: {tables: string[]}}>(['mysql', 'tables', '-p', 'alt'], configDir)

    expect(defaults.data.tables).to.include('users')
    expect(alt.data.tables).to.deep.equal(['audit_log'])
  })

  it('prints human-readable output without --json', async () => {
    const {stdout} = await runCliOk(['mysql', 'databases'], configDir)

    expect(stdout).to.include('Databases:')
    expect(stdout).to.include('• mq_e2e')
  })
})
