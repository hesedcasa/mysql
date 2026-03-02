import {Args, Command, Flags} from '@oclif/core'

import {closeConnections, explainQuery, getMySQLConfig, setConfigDir} from '../../mysql/index.js'

export default class MySQLExplain extends Command {
  static override args = {
    query: Args.string({description: 'SQL query to explain', required: true}),
  }
  static override description = 'Show the execution plan for a MySQL query'
  static override examples = [
    '<%= config.bin %> <%= command.id %> "SELECT * FROM users WHERE id = 1"',
    '<%= config.bin %> <%= command.id %> "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --format json',
  ]
  static override flags = {
    format: Flags.string({
      default: 'table',
      description: 'Output format',
      options: ['table', 'json', 'toon'],
    }),
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(MySQLExplain)

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getMySQLConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await explainQuery(profile, args.query, flags.format as 'json' | 'table' | 'toon')
    await closeConnections()

    if (result.success) {
      this.log(result.result ?? '')
    } else {
      this.error(result.error ?? 'Failed to explain query')
    }
  }
}
