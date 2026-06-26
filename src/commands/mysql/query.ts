import {ApiResult} from '@hesed/plugin-lib'
import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {QueryData} from '../../mysql/database.js'
import {closeConnections, executeQuery} from '../../mysql/index.js'

export default class MySQLQuery extends BaseCommand {
  static override args = {
    query: Args.string({description: 'SQL query to execute', required: true}),
  }
  static override description = 'Execute a SQL query against a MySQL database'
  static override examples = [
    '<%= config.bin %> <%= command.id %> "SELECT * FROM users LIMIT 10" --json',
    '<%= config.bin %> <%= command.id %> "UPDATE users SET email = \'user@email.com\' WHERE id = 999"',
    '<%= config.bin %> <%= command.id %> "DELETE FROM sessions" -p prod --skip-confirmation',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    'skip-confirmation': Flags.boolean({
      default: false,
      description: 'Skip confirmation prompt for destructive operations',
    }),
    toon: Flags.boolean({description: 'Format output as toon', required: false}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(MySQLQuery)

    const result = await executeQuery(
      this.config,
      args.query,
      flags.profile,
      flags.toon ? 'toon' : flags.json ? 'json' : 'table',
      flags['skip-confirmation'],
    )
    await closeConnections()

    if (result.success) {
      // Notices (warnings, row counts) go to stderr so machine-readable formats
      // leave stdout as clean, parseable data.
      if (result.data?.notices) this.logToStderr(result.data.notices)

      this.log(result.data?.result ?? '')

      delete (result.data as QueryData).notices

      return result
    }

    if (result.data?.requiresConfirmation) {
      this.log(
        `${result.data?.message ?? 'Destructive operation requires confirmation.'}\nRe-run with --skip-confirmation to proceed.`,
      )
      return result
    }

    this.error(String(result.error ?? 'Query failed'))
  }
}
