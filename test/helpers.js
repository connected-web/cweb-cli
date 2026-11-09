import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))
export function fixture (t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cweb-public-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const accounts = path.join(home, '.cweb', 'accounts')
  fs.mkdirSync(accounts, { recursive: true })
  const env = { ...process.env, HOME: home, USERPROFILE: home, CWEB_ACCOUNTS_DIR: accounts }
  delete env.CWEB_CLIENT_ID; delete env.CWEB_CLIENT_SECRET; delete env.CWEB_AUTH_CONFIG_URL
  const exec = (args, extra = {}) => run(process.execPath, [path.join(root, 'bin/cweb.mjs'), ...args], { env, cwd: home, ...extra })
  return { home, env, accounts, exec }
}
export function run (command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}
export function jwt (claims = {}) {
  return `fixture.${Buffer.from(JSON.stringify({ sub: 'user-one', client_id: 'fixture-client', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString('base64url')}.fixture`
}
export function session (home, profile, data) {
  const directory = path.join(home, '.cweb', 'profiles', profile)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'info.json'), JSON.stringify(data))
}
export function executable (directory, name, packageName, source) {
  fs.mkdirSync(directory, { recursive: true })
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(directory, `${name}.cmd`), '@echo off\n')
    const pkg = path.join(directory, 'node_modules', ...packageName.split('/'))
    fs.mkdirSync(pkg, { recursive: true })
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ bin: { [name]: 'entry.cjs' } }))
    fs.writeFileSync(path.join(pkg, 'entry.cjs'), source)
  } else {
    fs.writeFileSync(path.join(directory, name), '#!/usr/bin/env node\n' + source, { mode: 0o755 })
  }
}
