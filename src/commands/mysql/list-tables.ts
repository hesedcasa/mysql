import {Command, Flags} from '@oclif/core'

import {closeConnections, getMySQLConfig, listTables, setConfigDir} from '../../mysql/index.js'

export default class MySQLTables extends Command {
  static override description = 'List all tables in the current MySQL database'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --profile local',
  ]
  static override flags = {
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MySQLTables)

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getMySQLConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await listTables(profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.tables)
    } else {
      this.error(result.error ?? 'Failed to list tables')
    }
  }
}
