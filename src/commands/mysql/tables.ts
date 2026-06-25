import {Command, Flags} from '@oclif/core'

import {closeConnections, listTables} from '../../mysql/index.js'

export default class MySQLTables extends Command {
  static override description = 'List all tables in the current MySQL database'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p local']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MySQLTables)

    const result = await listTables(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.tables)
    } else {
      this.error(result.error ?? 'Failed to list tables')
    }
  }
}
