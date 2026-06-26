import {ApiResult} from '@hesed/plugin-lib'
import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {TableStructureData} from '../../mysql/database.js'
import {closeConnections, describeTable} from '../../mysql/index.js'

export default class MySQLDescribeTable extends BaseCommand {
  static override args = {
    table: Args.string({description: 'Table name to describe', required: true}),
  }
  static override description = 'Describe the structure of a MySQL table'
  static override examples = [
    '<%= config.bin %> <%= command.id %> users',
    '<%= config.bin %> <%= command.id %> orders --toon -p prod',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    toon: Flags.boolean({description: 'Format output as toon', required: false}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(MySQLDescribeTable)

    const result = await describeTable(
      this.config,
      args.table,
      flags.profile,
      flags.toon ? 'toon' : flags.json ? 'json' : 'table',
    )
    await closeConnections()

    if (result.success) {
      this.log(result.data?.result ?? '')

      delete (result.data as TableStructureData).result

      return result
    }

    this.error(String(result.error ?? 'Failed to describe table'))
  }
}
