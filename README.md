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
@hesed/mysql/0.2.0 linux-x64 node-v20.20.0
$ mq --help [COMMAND]
USAGE
  $ mq COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`mq mysql auth add`](#mq-mysql-auth-add)
* [`mq mysql auth test`](#mq-mysql-auth-test)
* [`mq mysql auth update`](#mq-mysql-auth-update)
* [`mq mysql databases`](#mq-mysql-databases)
* [`mq mysql describe-table TABLE`](#mq-mysql-describe-table-table)
* [`mq mysql explain-query QUERY`](#mq-mysql-explain-query-query)
* [`mq mysql indexes TABLE`](#mq-mysql-indexes-table)
* [`mq mysql query QUERY`](#mq-mysql-query-query)
* [`mq mysql tables`](#mq-mysql-tables)

## `mq mysql auth add`

Add a MySQL connection profile

```
USAGE
  $ mq mysql auth add -d <value> --host <value> -p <value> -P <value> --profile <value> -u <value> [--json] [--ssl]

FLAGS
  -P, --port=<value>      (required) MySQL port
  -d, --database=<value>  (required) Database name
  -p, --password=<value>  (required) Password
  -u, --user=<value>      (required) Username
      --host=<value>      (required) MySQL host
      --profile=<value>   (required) Profile name
      --[no-]ssl          Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a MySQL connection profile

EXAMPLES
  $ mq mysql auth add

  $ mq mysql auth add --no-ssl
```

_See code: [src/commands/mysql/auth/add.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/auth/add.ts)_

## `mq mysql auth test`

Test MySQL database connection

```
USAGE
  $ mq mysql auth test [--json] [--profile <value>]

FLAGS
  --profile=<value>  Profile name to test

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Test MySQL database connection

EXAMPLES
  $ mq mysql auth test

  $ mq mysql auth test --profile staging
```

_See code: [src/commands/mysql/auth/test.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/auth/test.ts)_

## `mq mysql auth update`

Update an existing MySQL connection profile

```
USAGE
  $ mq mysql auth update -d <value> --host <value> -p <value> -P <value> -u <value> [--json] [--profile <value>] [--ssl]

FLAGS
  -P, --port=<value>      (required) MySQL port
  -d, --database=<value>  (required) Database name
  -p, --password=<value>  (required) Password
  -u, --user=<value>      (required) Username
      --host=<value>      (required) MySQL host
      --profile=<value>   Profile name to update
      --[no-]ssl          Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Update an existing MySQL connection profile

EXAMPLES
  $ mq mysql auth update --ssl

  $ mq mysql auth update --profile staging
```

_See code: [src/commands/mysql/auth/update.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/auth/update.ts)_

## `mq mysql databases`

List all databases accessible on the MySQL server

```
USAGE
  $ mq mysql databases [--profile <value>]

FLAGS
  --profile=<value>  Database profile name from config

DESCRIPTION
  List all databases accessible on the MySQL server

EXAMPLES
  $ mq mysql databases

  $ mq mysql databases --profile staging
```

_See code: [src/commands/mysql/databases.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/databases.ts)_

## `mq mysql describe-table TABLE`

Describe the structure of a MySQL table

```
USAGE
  $ mq mysql describe-table TABLE [--format table|json|toon] [--profile <value>]

ARGUMENTS
  TABLE  Table name to describe

FLAGS
  --format=<option>  [default: table] Output format
                     <options: table|json|toon>
  --profile=<value>  Database profile name from config

DESCRIPTION
  Describe the structure of a MySQL table

EXAMPLES
  $ mq mysql describe-table users

  $ mq mysql describe-table orders --format json --profile prod
```

_See code: [src/commands/mysql/describe-table.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/describe-table.ts)_

## `mq mysql explain-query QUERY`

Show the execution plan for a MySQL query

```
USAGE
  $ mq mysql explain-query QUERY [--format table|json|toon] [--profile <value>]

ARGUMENTS
  QUERY  SQL query to explain

FLAGS
  --format=<option>  [default: table] Output format
                     <options: table|json|toon>
  --profile=<value>  Database profile name from config

DESCRIPTION
  Show the execution plan for a MySQL query

EXAMPLES
  $ mq mysql explain-query "SELECT * FROM users WHERE id = 1"

  $ mq mysql explain-query "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --format json
```

_See code: [src/commands/mysql/explain-query.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/explain-query.ts)_

## `mq mysql indexes TABLE`

Show indexes for a MySQL table

```
USAGE
  $ mq mysql indexes TABLE [--format table|json|toon] [--profile <value>]

ARGUMENTS
  TABLE  Table name to show indexes for

FLAGS
  --format=<option>  [default: table] Output format
                     <options: table|json|toon>
  --profile=<value>  Database profile name from config

DESCRIPTION
  Show indexes for a MySQL table

EXAMPLES
  $ mq mysql indexes users

  $ mq mysql indexes orders --format json --profile prod
```

_See code: [src/commands/mysql/indexes.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/indexes.ts)_

## `mq mysql query QUERY`

Execute a SQL query against a MySQL database

```
USAGE
  $ mq mysql query QUERY [--format table|json|csv|toon] [--profile <value>] [--skip-confirmation]

ARGUMENTS
  QUERY  SQL query to execute

FLAGS
  --format=<option>    [default: table] Output format
                       <options: table|json|csv|toon>
  --profile=<value>    Database profile name from config
  --skip-confirmation  Skip confirmation prompt for destructive operations

DESCRIPTION
  Execute a SQL query against a MySQL database

EXAMPLES
  $ mq mysql query "SELECT * FROM users LIMIT 10"

  $ mq mysql query "UPDATE users SET email = 'user@email.com' WHERE id = 999" --format json

  $ mq mysql query "DELETE FROM sessions" --profile prod --skip-confirmation
```

_See code: [src/commands/mysql/query.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/query.ts)_

## `mq mysql tables`

List all tables in the current MySQL database

```
USAGE
  $ mq mysql tables [--profile <value>]

FLAGS
  --profile=<value>  Database profile name from config

DESCRIPTION
  List all tables in the current MySQL database

EXAMPLES
  $ mq mysql tables

  $ mq mysql tables --profile local
```

_See code: [src/commands/mysql/tables.ts](https://github.com/hesedcasa/mysql/blob/v0.2.0/src/commands/mysql/tables.ts)_
<!-- commandsstop -->
