import {Args, Command} from '@oclif/core'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

import type {MySQLJsonConfig} from '../../../mysql/index.js'

import {readConfig} from '../../../config.js'

export default class AuthProfile extends Command {
  static override args = {
    profile: Args.string({description: 'Profile name to set as default', required: true}),
  }

  static override description = 'Set the default MySQL auth profile'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %> myprofile']

  public async run(): Promise<void> {
    const {args} = await this.parse(AuthProfile)
    const config = await readConfig(this.config.configDir, this.log.bind(this))
    if (!config) {
      this.error('No config found. Run mq auth add first.')
      return
    }

    if (!config.profiles?.[args.profile]) {
      this.error(`Profile "${args.profile}" not found. Available: ${Object.keys(config.profiles).join(', ')}`)
      return
    }

    config.defaultProfile = args.profile
    const configPath = path.join(this.config.configDir, 'mysql-config.json')
    await fs.writeJSON(configPath, config as MySQLJsonConfig, {mode: 0o600})
    this.log(`Default profile set to "${args.profile}".`)
  }
}
