import {expect} from 'chai'

import {createConfigDir, removeConfigDir, runCli, runCliJson, runCliOk} from './helpers.js'

type Column = {Default: null | string; Extra: string; Field: string; Key: string; Null: string; Type: string}
type Index = {Column_name: string; Key_name: string; Non_unique: number; Table: string}
type ExplainRow = {key: null | string; possible_keys: null | string; table: string; type: string}

describe('e2e: schema inspection', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('lists the seeded tables', async () => {
    const payload = await runCliJson<{data: {tables: string[]}}>(['mysql', 'tables'], configDir)

    expect(payload.data.tables).to.deep.equal(['metrics', 'orders', 'quirky', 'users'])
  })

  it('reports an empty schema without failing', async () => {
    const payload = await runCliJson<{data: {tables: string[]}; success: boolean}>(
      ['mysql', 'tables', '-p', 'empty'],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.tables).to.deep.equal([])
  })

  it('tells a human that an empty schema has no tables', async () => {
    const {stdout} = await runCliOk(['mysql', 'tables', '-p', 'empty'], configDir)

    expect(stdout).to.include('No tables found in this database')
  })

  it('describes a table down to column types and keys', async () => {
    const payload = await runCliJson<{data: {structure: Column[]}}>(['mysql', 'describe-table', 'orders'], configDir)

    const byField = new Map(payload.data.structure.map((c) => [c.Field, c]))
    expect(payload.data.structure.map((c) => c.Field)).to.deep.equal(['id', 'user_id', 'total', 'status', 'created_at'])
    expect(byField.get('id')).to.include({Extra: 'auto_increment', Key: 'PRI', Type: 'int unsigned'})
    expect(byField.get('total')?.Type).to.equal('decimal(10,2)')
    expect(byField.get('user_id')?.Key).to.equal('MUL')
  })

  it('shows every index on a table, including the unique one', async () => {
    const payload = await runCliJson<{data: {indexes: Index[]}}>(['mysql', 'indexes', 'users'], configDir)

    const byName = new Map(payload.data.indexes.map((i) => [i.Key_name, i]))
    expect(payload.data.indexes.map((i) => i.Key_name)).to.have.members([
      'PRIMARY',
      'uniq_users_email',
      'idx_users_status',
    ])
    expect(byName.get('uniq_users_email')?.Non_unique).to.equal(0)
    expect(byName.get('idx_users_status')?.Non_unique).to.equal(1)
    expect(byName.get('idx_users_status')?.Column_name).to.equal('status')
  })

  it('explains a query and reports the index it will use', async () => {
    const payload = await runCliJson<{data: {plan: ExplainRow[]}}>(
      ['mysql', 'explain', 'SELECT * FROM orders WHERE user_id = 1'],
      configDir,
    )

    expect(payload.data.plan).to.have.lengthOf(1)
    expect(payload.data.plan[0].table).to.equal('orders')
    expect(payload.data.plan[0].key).to.equal('idx_orders_user_id')
  })

  it('renders describe-table as a box table for humans', async () => {
    const {stdout} = await runCliOk(['mysql', 'describe-table', 'users'], configDir)

    expect(stdout).to.include('┌')
    expect(stdout).to.include('Field')
    expect(stdout).to.include('email')
  })

  it('renders describe-table as toon with --toon', async () => {
    const {stdout} = await runCliOk(['mysql', 'describe-table', 'users', '--toon'], configDir)

    expect(stdout.trim()).to.match(/^\[\d+\]\{/u)
    expect(stdout).to.include('email')
  })

  it('errors on a table that does not exist', async () => {
    const {code, stderr} = await runCli(['mysql', 'describe-table', 'no_such_table'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr).to.include("Table 'mq_e2e.no_such_table' doesn't exist")
    // oclif supplies the "Error:" label, so the layer must not add one too.
    expect(stderr).to.not.include('Error: ERROR:')
  })
})
