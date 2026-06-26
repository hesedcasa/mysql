import {ApiResult} from '@hesed/plugin-lib'
import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {ExplainData} from '../../mysql/database.js'
import {closeConnections, explainQuery} from '../../mysql/index.js'

export default class MySQLExplain extends BaseCommand {
  static override args = {
    query: Args.string({description: 'SQL query to explain', required: true}),
  }
  static override description = 'Show the execution plan for a MySQL query'
  static override examples = [
    '<%= config.bin %> <%= command.id %> "SELECT * FROM users WHERE id = 1"',
    '<%= config.bin %> <%= command.id %> "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --json',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    toon: Flags.boolean({description: 'Format output as toon', required: false}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(MySQLExplain)

    const result = await explainQuery(
      this.config,
      args.query,
      flags.profile,
      flags.toon ? 'toon' : flags.json ? 'json' : 'table',
    )
    await closeConnections()

    if (result.success) {
      this.log(result.data?.result ?? '')

      delete (result.data as ExplainData).result

      return result
    }

    this.error(String(result.error ?? 'Failed to explain query'))
  }
}
