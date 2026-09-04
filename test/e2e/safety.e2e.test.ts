import {expect} from 'chai'

import {createConfigDir, removeConfigDir, runCli, runCliJson, runCliOk} from './helpers.js'

type Row = Record<string, unknown>
type WriteResult = {data: {result: {affectedRows: number; insertId?: number}}; success: boolean}

// Each test owns a uniquely named scratch table so the suite is re-runnable
// against a long-lived container and safe to run in parallel files.
const scratch = (suffix: string) => `scratch_${suffix}_${process.pid}`

describe('e2e: safety rules and writes', () => {
  let configDir: string
  const created: string[] = []

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    for (const table of created) {
      // eslint-disable-next-line no-await-in-loop
      await runCli(['mysql', 'query', `DROP TABLE IF EXISTS ${table}`, '--skip-confirmation'], configDir)
    }

    await removeConfigDir(configDir)
  })

  async function createScratch(suffix: string): Promise<string> {
    const table = scratch(suffix)
    created.push(table)
    await runCliOk(
      [
        'mysql',
        'query',
        `CREATE TABLE ${table} (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, note VARCHAR(64) NOT NULL)`,
        '--skip-confirmation',
      ],
      configDir,
    )
    return table
  }

  it('blocks a blacklisted operation outright', async () => {
    const {code, stderr} = await runCli(['mysql', 'query', 'DROP DATABASE mq_e2e_alt'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr).to.include('"DROP DATABASE" is blacklisted')
    expect(stderr).to.include('blocked by safety rules')

    // The database must still be there.
    const payload = await runCliJson<{data: {databases: string[]}}>(['mysql', 'databases'], configDir)
    expect(payload.data.databases).to.include('mq_e2e_alt')
  })

  it('blocks a blacklisted operation written with extra whitespace', async () => {
    const {code, stderr} = await runCli(['mysql', 'query', 'DROP  DATABASE mq_e2e_alt'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr).to.include('"DROP DATABASE" is blacklisted')

    const payload = await runCliJson<{data: {databases: string[]}}>(['mysql', 'databases'], configDir)
    expect(payload.data.databases).to.include('mq_e2e_alt')
  })

  it('requires confirmation when a leading comment pushes the operation onto its own line', async () => {
    // Runs against a scratch table: if the guard ever regresses, the DELETE
    // executes, and it must not be able to touch the seeded fixtures.
    const table = await createScratch('comment')
    await runCliOk(['mysql', 'query', `INSERT INTO ${table} (note) VALUES ('keep me')`], configDir)

    const {code, stdout} = await runCli(['mysql', 'query', `/* migration 12 */\nDELETE FROM ${table}`], configDir)

    expect(code).to.equal(0)
    expect(stdout).to.include('This query contains a destructive operation: DELETE')

    const check = await runCliJson<{data: {result: Row[]}}>(
      ['mysql', 'query', `SELECT COUNT(*) AS c FROM ${table}`],
      configDir,
    )
    expect(check.data.result[0].c).to.equal(1)
  })

  it('refuses a destructive query without --skip-confirmation and changes nothing', async () => {
    const {code, stdout} = await runCli(['mysql', 'query', 'DELETE FROM orders WHERE id = 1'], configDir)

    expect(code).to.equal(0)
    expect(stdout).to.include('This query contains a destructive operation: DELETE')
    expect(stdout).to.include('Re-run with --skip-confirmation to proceed.')

    const check = await runCliJson<{data: {result: Row[]}}>(
      ['mysql', 'query', 'SELECT COUNT(*) AS c FROM orders WHERE id = 1'],
      configDir,
    )
    expect(check.data.result[0].c).to.equal(1)
  })

  it('runs INSERT, UPDATE and DELETE against a scratch table', async () => {
    const table = await createScratch('crud')

    const inserted = await runCliJson<WriteResult>(
      ['mysql', 'query', `INSERT INTO ${table} (note) VALUES ('alpha'), ('beta')`],
      configDir,
    )
    expect(inserted.data.result.affectedRows).to.equal(2)
    expect(inserted.data.result.insertId).to.equal(1)

    const updated = await runCliJson<WriteResult>(
      ['mysql', 'query', `UPDATE ${table} SET note = 'gamma' WHERE note = 'alpha'`, '--skip-confirmation'],
      configDir,
    )
    expect(updated.data.result.affectedRows).to.equal(1)

    const selected = await runCliJson<{data: {result: Row[]}}>(
      ['mysql', 'query', `SELECT note FROM ${table} ORDER BY id`],
      configDir,
    )
    expect(selected.data.result).to.deep.equal([{note: 'gamma'}, {note: 'beta'}])

    const deleted = await runCliJson<WriteResult>(
      ['mysql', 'query', `DELETE FROM ${table} WHERE note = 'beta'`, '--skip-confirmation'],
      configDir,
    )
    expect(deleted.data.result.affectedRows).to.equal(1)

    const remaining = await runCliJson<{data: {result: Row[]}}>(
      ['mysql', 'query', `SELECT COUNT(*) AS c FROM ${table}`],
      configDir,
    )
    expect(remaining.data.result[0].c).to.equal(1)
  })

  it('warns about an UPDATE with no WHERE clause but still runs it', async () => {
    // The table name contains "where", which must not read as a WHERE clause.
    const table = await createScratch('nowhere')
    await runCliOk(['mysql', 'query', `INSERT INTO ${table} (note) VALUES ('a'), ('b')`], configDir)

    const {stderr, stdout} = await runCliOk(
      ['mysql', 'query', `UPDATE ${table} SET note = 'wiped'`, '--skip-confirmation'],
      configDir,
    )

    expect(stdout + stderr).to.include('Missing WHERE clause in UPDATE/DELETE query')
    expect(stdout + stderr).to.include('Affected rows: 2')
  })

  it('creates and drops a table through the CLI', async () => {
    const table = await createScratch('lifecycle')

    const afterCreate = await runCliJson<{data: {tables: string[]}}>(['mysql', 'tables'], configDir)
    expect(afterCreate.data.tables).to.include(table)

    await runCliOk(['mysql', 'query', `DROP TABLE ${table}`, '--skip-confirmation'], configDir)

    const afterDrop = await runCliJson<{data: {tables: string[]}}>(['mysql', 'tables'], configDir)
    expect(afterDrop.data.tables).to.not.include(table)
  })

  it('survives many CLI invocations hitting the server at once', async () => {
    // Each invocation is its own process with its own pool, so this exercises
    // connection setup/teardown under parallel load rather than the in-process
    // query-slot queue (which only ever sees one query per CLI run).
    const results = await Promise.all(
      Array.from({length: 8}, async (_, i) =>
        runCli(['mysql', 'query', `SELECT SLEEP(0.2) AS slept, ${i} AS n`], configDir),
      ),
    )

    for (const result of results) {
      expect(result.code, result.stderr).to.equal(0)
    }
  })

  it('exits promptly after a query, leaving no connection open', async () => {
    const started = Date.now()
    await runCliOk(['mysql', 'query', 'SELECT 1 AS one'], configDir)
    const elapsed = Date.now() - started

    // A leaked pool would keep the event loop alive until the socket timed out.
    expect(elapsed).to.be.lessThan(20_000)

    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['mysql', 'query', "SHOW STATUS LIKE 'Threads_connected'"],
      configDir,
    )
    expect(Number(payload.data.result[0].Value)).to.be.lessThan(20)
  })
})
