import {expect} from 'chai'

import type {MySQLConfig} from '../../src/mysql/config-loader.js'

import {getMySQLConnectionOptions} from '../../src/mysql/config-loader.js'

describe('mysql/config-loader', () => {
  const mockConfig: MySQLConfig = {
    defaultFormat: 'table',
    defaultProfile: 'local',
    profiles: {
      local: {database: 'mydb', host: 'localhost', password: 'secret', port: 3306, user: 'root'},
      staging: {
        database: 'appdb',
        host: 'staging-db.example.com',
        password: 'apppass',
        port: 3306,
        ssl: true,
        user: 'appuser',
      },
    },
    safety: {
      blacklistedOperations: ['DROP DATABASE'],
      defaultLimit: 100,
      requireConfirmationFor: ['DELETE', 'UPDATE', 'DROP', 'TRUNCATE', 'ALTER'],
    },
  }

  describe('getMySQLConnectionOptions', () => {
    it('returns connection options for a valid profile', () => {
      const options = getMySQLConnectionOptions(mockConfig, 'local')

      expect(options.host).to.equal('localhost')
      expect(options.port).to.equal(3306)
      expect(options.user).to.equal('root')
      expect(options.password).to.equal('secret')
      expect(options.database).to.equal('mydb')
      expect(options.multipleStatements).to.be.false
    })

    it('includes ssl when profile has ssl: true', () => {
      const options = getMySQLConnectionOptions(mockConfig, 'staging')

      expect(options.ssl).to.deep.equal({})
    })

    it('throws when profile does not exist', () => {
      expect(() => getMySQLConnectionOptions(mockConfig, 'nonexistent')).to.throw('nonexistent')
    })
  })
})
