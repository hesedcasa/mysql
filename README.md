# mysql

CLI for MySQL database interaction

[![Version](https://img.shields.io/npm/v/@hesed/mysql.svg)](https://npmjs.org/package/@hesed/mysql)
[![Downloads/week](https://img.shields.io/npm/dw/@hesed/mysql.svg)](https://npmjs.org/package/@hesed/mysql)

# Install

```bash
sdkck plugins install @hesed/mysql
```

<!-- toc -->
* [mysql](#mysql)
* [Install](#install)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @hesed/mysql
$ mq COMMAND
running command...
$ mq (--version)
@hesed/mysql/0.5.1 linux-x64 node-v22.23.0
$ mq --help [COMMAND]
USAGE
  $ mq COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`mq mysql auth add`](#mq-mysql-auth-add)
* [`mq mysql auth delete`](#mq-mysql-auth-delete)
* [`mq mysql auth list`](#mq-mysql-auth-list)
* [`mq mysql auth profile`](#mq-mysql-auth-profile)
* [`mq mysql auth test`](#mq-mysql-auth-test)
* [`mq mysql auth update`](#mq-mysql-auth-update)
* [`mq mysql databases`](#mq-mysql-databases)
* [`mq mysql describe-table TABLE`](#mq-mysql-describe-table-table)
* [`mq mysql explain-query QUERY`](#mq-mysql-explain-query-query)
* [`mq mysql indexes TABLE`](#mq-mysql-indexes-table)
* [`mq mysql query QUERY`](#mq-mysql-query-query)
* [`mq mysql tables`](#mq-mysql-tables)

## `mq mysql auth add`

Add MySQL authentication

```
USAGE
  $ mq mysql auth add -p <value> --host <value> --port <value> -u <value> --password <value> -d <value> --ssl
    [--json]

FLAGS
  -d, --database=<value>  (required) Database name
  -p, --profile=<value>   (required) Profile name
  -u, --user=<value>      (required) Username
      --host=<value>      (required) MySQL host
      --password=<value>  (required) Password
      --port=<value>      (required) MySQL port
      --ssl               (required) Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add MySQL authentication

EXAMPLES
  $ mq mysql auth add

  $ mq mysql auth add -p prod
```

_See code: [src/commands/mysql/auth/add.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/auth/add.ts)_

## `mq mysql auth delete`

Delete an authentication profile

```
USAGE
  $ mq mysql auth delete [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Profile to delete

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Delete an authentication profile

EXAMPLES
  $ mq mysql auth delete

  $ mq mysql auth delete -p prod
```

_See code: [src/commands/mysql/auth/delete.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/auth/delete.ts)_

## `mq mysql auth list`

List authentication profiles

```
USAGE
  $ mq mysql auth list [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List authentication profiles

EXAMPLES
  $ mq mysql auth list
```

_See code: [src/commands/mysql/auth/list.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/auth/list.ts)_

## `mq mysql auth profile`

Set or show the default authentication profile

```
USAGE
  $ mq mysql auth profile [--json] [--default <value>]

FLAGS
  --default=<value>  Profile to set as default

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Set or show the default authentication profile

EXAMPLES
  $ mq mysql auth profile

  $ mq mysql auth profile --default test
```

_See code: [src/commands/mysql/auth/profile.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/auth/profile.ts)_

## `mq mysql auth test`

Test authentication and connection

```
USAGE
  $ mq mysql auth test [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Authentication profile name

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Test authentication and connection

EXAMPLES
  $ mq mysql auth test

  $ mq mysql auth test -p prod
```

_See code: [src/commands/mysql/auth/test.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/auth/test.ts)_

## `mq mysql auth update`

Update MySQL authentication

```
USAGE
  $ mq mysql auth update -p <value> --host <value> --port <value> -u <value> --password <value> -d <value> --ssl
    [--json]

FLAGS
  -d, --database=<value>  (required) Database name
  -p, --profile=<value>   (required) Profile name
  -u, --user=<value>      (required) Username
      --host=<value>      (required) MySQL host
      --password=<value>  (required) Password
      --port=<value>      (required) MySQL port
      --ssl               (required) Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Update MySQL authentication

EXAMPLES
  $ mq mysql auth update

  $ mq mysql auth update -p test
```

_See code: [src/commands/mysql/auth/update.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/auth/update.ts)_

## `mq mysql databases`

List all databases accessible on the MySQL server

```
USAGE
  $ mq mysql databases [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Database profile name from config

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List all databases accessible on the MySQL server

EXAMPLES
  $ mq mysql databases

  $ mq mysql databases -p staging
```

_See code: [src/commands/mysql/databases.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/databases.ts)_

## `mq mysql describe-table TABLE`

Describe the structure of a MySQL table

```
USAGE
  $ mq mysql describe-table TABLE [--json] [--format table|json|toon] [-p <value>]

ARGUMENTS
  TABLE  Table name to describe

FLAGS
  -p, --profile=<value>  Database profile name from config
      --format=<option>  [default: table] Output format
                         <options: table|json|toon>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Describe the structure of a MySQL table

EXAMPLES
  $ mq mysql describe-table users

  $ mq mysql describe-table orders --format json -p prod
```

_See code: [src/commands/mysql/describe-table.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/describe-table.ts)_

## `mq mysql explain-query QUERY`

Show the execution plan for a MySQL query

```
USAGE
  $ mq mysql explain-query QUERY [--json] [--format table|json|toon] [-p <value>]

ARGUMENTS
  QUERY  SQL query to explain

FLAGS
  -p, --profile=<value>  Database profile name from config
      --format=<option>  [default: table] Output format
                         <options: table|json|toon>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the execution plan for a MySQL query

EXAMPLES
  $ mq mysql explain-query "SELECT * FROM users WHERE id = 1"

  $ mq mysql explain-query "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --format json
```

_See code: [src/commands/mysql/explain-query.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/explain-query.ts)_

## `mq mysql indexes TABLE`

Show indexes for a MySQL table

```
USAGE
  $ mq mysql indexes TABLE [--json] [--format table|json|toon] [-p <value>]

ARGUMENTS
  TABLE  Table name to show indexes for

FLAGS
  -p, --profile=<value>  Database profile name from config
      --format=<option>  [default: table] Output format
                         <options: table|json|toon>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show indexes for a MySQL table

EXAMPLES
  $ mq mysql indexes users

  $ mq mysql indexes orders --format json -p prod
```

_See code: [src/commands/mysql/indexes.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/indexes.ts)_

## `mq mysql query QUERY`

Execute a SQL query against a MySQL database

```
USAGE
  $ mq mysql query QUERY [--json] [--format table|json|csv|toon] [-p <value>] [--skip-confirmation]

ARGUMENTS
  QUERY  SQL query to execute

FLAGS
  -p, --profile=<value>    Database profile name from config
      --format=<option>    [default: table] Output format
                           <options: table|json|csv|toon>
      --skip-confirmation  Skip confirmation prompt for destructive operations

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Execute a SQL query against a MySQL database

EXAMPLES
  $ mq mysql query "SELECT * FROM users LIMIT 10"

  $ mq mysql query "UPDATE users SET email = 'user@email.com' WHERE id = 999" --format json

  $ mq mysql query "DELETE FROM sessions" -p prod --skip-confirmation
```

_See code: [src/commands/mysql/query.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/query.ts)_

## `mq mysql tables`

List all tables in the current MySQL database

```
USAGE
  $ mq mysql tables [-p <value>]

FLAGS
  -p, --profile=<value>  Database profile name from config

DESCRIPTION
  List all tables in the current MySQL database

EXAMPLES
  $ mq mysql tables

  $ mq mysql tables -p local
```

_See code: [src/commands/mysql/tables.ts](https://github.com/hesedcasa/mysql/blob/v0.5.1/src/commands/mysql/tables.ts)_
<!-- commandsstop -->
