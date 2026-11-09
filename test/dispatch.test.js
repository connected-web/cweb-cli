import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import fs from 'node:fs'
import { fixture, executable, session, jwt, run, root } from './helpers.js'
import { commandLine } from '../src/cli.js'
import { curlArguments } from '../src/curl.js'

const escaped = ['--search', 'a `literal` $(value); & "quoted"', '--json', '--profile', 'plugin-profile']
test('domain arguments, help, stdout and exit codes pass through unchanged', async t => {
  const f = fixture(t)
  const bin = path.join(f.home, 'bin')
  executable(bin, 'cweb-tasks', '@connected-web/cweb-tasks', 'console.log(JSON.stringify(process.argv.slice(2)));process.exitCode=7')
  f.env.PATH = bin + path.delimiter + f.env.PATH
  const result = await f.exec(['-p', 'core-profile', 'tasks', ...escaped])
  assert.equal(result.code, 7)
  assert.deepEqual(JSON.parse(result.stdout), ['--profile', 'core-profile', ...escaped])
  assert.equal(result.stderr, '')
  const help = await f.exec(['tasks', '--help'])
  assert.deepEqual(JSON.parse(help.stdout), ['--help'])
})
test('legacy engineering calls preserve all arguments and send warnings only to stderr', async t => {
  const f = fixture(t); const bin = path.join(f.home, 'bin')
  executable(bin, 'cweb-eng', '@connected-web/cweb-eng', 'console.log(JSON.stringify(process.argv.slice(2)))')
  f.env.PATH = bin + path.delimiter + f.env.PATH
  for (const args of [
    ['-p', 'org', 'package', 'pack', '--component', 'demo'],
    ['login', '-p', 'org', '--machine', '--get-access-token'],
    ['-p', 'org', '--user-pool-id', 'pool', 'curl', '--machine', '-sS', 'https://example.com']
  ]) {
    const result = await f.exec(args)
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), args)
    assert.match(result.stderr, /moved to cweb-eng/)
  }
})
test('missing plugins give an install command without invoking npm', async t => {
  const f = fixture(t)
  f.env.PATH = ''
  const result = await f.exec(['notes', 'list'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /cweb install notes/)
})
test('plugin install resolves an explicit package and uses arguments without a shell', async t => {
  const f = fixture(t); const bin = path.join(f.home, 'bin')
  executable(bin, 'npm', 'npm', 'console.log(JSON.stringify(process.argv.slice(2)))')
  f.env.PATH = bin + path.delimiter + f.env.PATH
  const result = await f.exec(['install', 'tasks'])
  assert.equal(result.code, 0, result.stderr)
  const args = JSON.parse(result.stdout)
  assert.ok(args.includes('@connected-web/cweb-tasks@latest'))
  assert.ok(args.includes('--registry=https://registry.npmjs.org'))
  const invalid = await f.exec(['install', 'tasks;echo-bad'])
  assert.equal(invalid.code, 1)
  assert.equal(invalid.stdout, '')
})
test('workspace errors explain the active account and next step', async t => {
  const f = fixture(t); const bin = path.join(f.home, 'bin')
  executable(bin, 'cweb-tasks', '@connected-web/cweb-tasks', 'console.error(\'No authorised workspace matches "example".\');process.exitCode=1')
  f.env.PATH = bin + path.delimiter + f.env.PATH
  session(f.home, 'connected-web-global', { token: { access: jwt(), expiresAt: Math.floor(Date.now() / 1000) + 3600 }, user: { sub: 'user-one', email: 'agent@example.test' } })
  const result = await f.exec(['tasks', 'list', 'example/project'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /agent@example.test/)
  assert.match(result.stderr, /ask an owner for access/)
})
test('prefix parsing and curl profile selection preserve the caller identity', () => {
  assert.equal(commandLine(['-p', 'org', '--machine', 'curl']).engineering, true)
  assert.equal(commandLine(['-p', 'global', 'tasks', '--help']).command, 'tasks')
  assert.deepEqual(curlArguments(['-p', 'chosen', '--user', '-sS', 'https://example.com'], 'initial'), { profile: 'chosen', forwarded: ['-sS', 'https://example.com'] })
})

test('cancellation reaches the plugin and returns a signal exit code', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t); const bin = path.join(f.home, 'bin')
  const ready = path.join(f.home, 'ready')
  const stopped = path.join(f.home, 'stopped')
  executable(bin, 'cweb-tasks', '@connected-web/cweb-tasks', `const fs = require('node:fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.env.TEST_STOPPED,'stopped');process.exit(0)});fs.writeFileSync(process.env.TEST_READY, 'ready');setInterval(()=>{},1000)`)
  f.env.PATH = bin + path.delimiter + f.env.PATH
  f.env.TEST_READY = ready; f.env.TEST_STOPPED = stopped
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, [path.join(root, 'bin/cweb.mjs'), 'tasks', 'list'], { env: f.env, stdio: 'pipe' })
  const done = new Promise(resolve => child.on('close', code => resolve(code)))
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  for (let i = 0; i < 200 && !fs.existsSync(ready); i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(fs.existsSync(ready), 'plugin did not start')
  child.kill('SIGTERM')
  assert.equal(await done, 0)
  assert.ok(fs.existsSync(stopped), 'plugin did not receive cancellation')
})
