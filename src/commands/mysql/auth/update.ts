import {createAuthUpdateCommand, type FieldDef} from '@hesed/plugin-lib'

import {closeConnections, testDirectConnection} from '../../../mysql/index.js'

const fields: FieldDef[] = [
  {description: 'MySQL host', name: 'host', type: 'string'},
  {default: 3306, description: 'MySQL port', name: 'port', type: 'number'},
  {char: 'u', description: 'Username', name: 'user', type: 'string'},
  {description: 'Password', name: 'password', type: 'string'},
  {char: 'd', description: 'Database name', name: 'database', type: 'string'},
  {default: false, description: 'Use SSL', name: 'ssl', required: false, type: 'boolean'},
  {
    default: 5,
    description: 'Max concurrent queries for this profile',
    name: 'maxConcurrentQueries',
    required: false,
    type: 'number',
  },
  {
    default: 60_000,
    description: 'Milliseconds a query may wait for a free query slot before failing',
    name: 'queryQueueTimeoutMs',
    required: false,
    type: 'number',
  },
]

export default createAuthUpdateCommand({
  clearClients: closeConnections,
  configFile: 'mysql-config.json',
  fields,
  serviceName: 'MySQL',
  testConnection: testDirectConnection,
})
