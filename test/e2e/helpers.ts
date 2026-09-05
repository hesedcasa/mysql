import {expect} from 'chai'
import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = path.join(REPO_ROOT, 'bin', 'run.js')

export const E2E_HOST = process.env.MQ_E2E_HOST ?? '127.0.0.1'
export const E2E_PORT = Number(process.env.MQ_E2E_PORT ?? 13_306)
export const E2E_DATABASE = 'mq_e2e'
export const E2E_ALT_DATABASE = 'mq_e2e_alt'
export const E2E_EMPTY_DATABASE = 'mq_e2e_empty'
export const E2E_USER = 'root'
export const E2E_PASSWORD = 'mq_root_pw'

export type CliResult = {
  code: number
  stderr: string
  stdout: string
}

/**
 * Writes a throwaway oclif config dir holding a `default` profile pointing at
 * the Docker MySQL server, an `alt` profile on a second schema, an `empty`
 * profile on a schema with no tables, and a `broken` profile with bad
 * credentials.
 *
 * @returns Absolute path to the config dir, to be passed as MQ_CONFIG_DIR.
 */
export async function createConfigDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mq-e2e-'))
  const profile = {
    database: E2E_DATABASE,
    host: E2E_HOST,
    maxConcurrentQueries: 5,
    password: E2E_PASSWORD,
    port: E2E_PORT,
    queryQueueTimeoutMs: 10_000,
    ssl: false,
    user: E2E_USER,
  }

  await fs.writeFile(
    path.join(dir, 'mysql-config.json'),
    JSON.stringify(
      {
        defaultProfile: 'default',
        profiles: {
          alt: {...profile, database: E2E_ALT_DATABASE},
          broken: {...profile, password: 'definitely-not-the-password'},
          default: profile,
          empty: {...profile, database: E2E_EMPTY_DATABASE},
        },
      },
      null,
      2,
    ),
    {mode: 0o600},
  )

  return dir
}

export async function removeConfigDir(dir: string): Promise<void> {
  await fs.rm(dir, {force: true, recursive: true})
}

/**
 * Runs the built CLI (`bin/run.js`) as a real subprocess against the Docker
 * MySQL server. Non-zero exits are returned rather than thrown so tests can
 * assert on failure paths.
 *
 * @param args Command line arguments, e.g. ['mysql', 'tables'].
 * @param configDir Value for MQ_CONFIG_DIR, from createConfigDir().
 * @returns The exit code and captured stdout/stderr.
 */
export async function runCli(args: string[], configDir: string): Promise<CliResult> {
  try {
    const {stderr, stdout} = await execFileAsync(process.execPath, [CLI, ...args], {
      env: {...process.env, FORCE_COLOR: '0', MQ_CONFIG_DIR: configDir, NO_COLOR: '1'},
      maxBuffer: 32 * 1024 * 1024,
    })
    return {code: 0, stderr, stdout}
  } catch (error: unknown) {
    const failure = error as {code?: number; stderr?: string; stdout?: string}
    return {code: failure.code ?? 1, stderr: failure.stderr ?? '', stdout: failure.stdout ?? ''}
  }
}

/**
 * Runs the CLI and fails the test if it exited non-zero.
 *
 * @param args Command line arguments.
 * @param configDir Value for MQ_CONFIG_DIR.
 * @returns The successful result.
 */
export async function runCliOk(args: string[], configDir: string): Promise<CliResult> {
  const result = await runCli(args, configDir)
  expect(result.code, `\`mq ${args.join(' ')}\` failed:\n${result.stderr}`).to.equal(0)
  return result
}

/**
 * Runs the CLI with --json and parses stdout.
 *
 * @param args Command line arguments; --json is appended automatically.
 * @param configDir Value for MQ_CONFIG_DIR.
 * @returns The parsed JSON payload.
 */
export async function runCliJson<T = unknown>(args: string[], configDir: string): Promise<T> {
  const {stdout} = await runCliOk([...args, '--json'], configDir)
  return JSON.parse(stdout) as T
}
