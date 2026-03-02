import {Command, Flags} from '@oclif/core'

import {closeConnections, getMySQLConfig, listDatabases, setConfigDir} from '../../mysql/index.js'

export default class MySQLDatabases extends Command {
  static override description = 'List all databases accessible on the MySQL server'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --profile staging',
  ]
  static override flags = {
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MySQLDatabases)

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getMySQLConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await listDatabases(profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.databases)
    } else {
      this.error(result.error ?? 'Failed to list databases')
    }
  }
}
