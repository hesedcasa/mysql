import {Command, Flags} from '@oclif/core'

import {closeConnections, listDatabases} from '../../mysql/index.js'

export default class MySQLDatabases extends Command {
  static override description = 'List all databases accessible on the MySQL server'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p staging']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MySQLDatabases)

    const result = await listDatabases(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.databases)
    } else {
      this.error(result.error ?? 'Failed to list databases')
    }
  }
}
