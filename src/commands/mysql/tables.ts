import type {ApiResult} from '@hesed/plugin-lib'

import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {TableListData} from '../../mysql/database.js'
import {closeConnections, listTables} from '../../mysql/index.js'

export default class MySQLTables extends BaseCommand {
  static override description = 'List all tables in the current MySQL database'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p local']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<ApiResult> {
    const {flags} = await this.parse(MySQLTables)

    const result = await listTables(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      this.log(result.data?.result ?? '')

      delete (result.data as TableListData).result

      return result
    }

    this.error(String(result.error ?? 'Failed to list tables'))
  }
}
