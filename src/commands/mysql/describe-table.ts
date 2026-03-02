import {Command, Flags} from '@oclif/core'

import {closeConnections, describeTable, getMySQLConfig, setConfigDir} from '../../mysql/index.js'

export default class MySQLDescribeTable extends Command {
  static override description = 'Describe the structure of a MySQL table'
  static override examples = [
    '<%= config.bin %> <%= command.id %> --table users',
    '<%= config.bin %> <%= command.id %> --table orders --format json --profile prod',
  ]
  static override flags = {
    format: Flags.string({
      default: 'table',
      description: 'Output format',
      options: ['table', 'json', 'toon'],
    }),
    profile: Flags.string({description: 'Database profile name from config', required: false}),
    table: Flags.string({char: 't', description: 'Table name to describe', required: true}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MySQLDescribeTable)

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getMySQLConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await describeTable(profile, flags.table, flags.format as 'json' | 'table' | 'toon')
    await closeConnections()

    if (result.success) {
      this.log(result.result ?? '')
    } else {
      this.error(result.error ?? 'Failed to describe table')
    }
  }
}
