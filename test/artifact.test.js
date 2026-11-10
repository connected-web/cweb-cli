import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fixture, root, run } from './helpers.js'

test('public npm artifact installs without runtime dependencies or organisation credentials', async t => {
  const f = fixture(t)
  const npmBin = process.env.npm_execpath || (process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    : fs.realpathSync(path.join(path.dirname(process.execPath), 'npm')))
  const npm = args => run(process.execPath, [npmBin, ...args], { cwd: root, env: f.env })
  const packed = await npm(['pack', '--json', '--ignore-scripts', '--pack-destination', f.home])
  assert.equal(packed.code, 0, packed.stderr)
  // npm 10/11 return an array; npm 12 keys the same entries by package name.
  const artifacts = Object.values(JSON.parse(packed.stdout))
  assert.equal(artifacts.length, 1, 'Expected one packed CLI artifact')
  const [artifact] = artifacts
  assert.equal(artifact.name, '@connected-web/cweb')
  assert.ok(!artifact.files.some(file => file.path.includes('test/') || file.path.includes('.github/') || file.path.includes('AGENTS')))
  const prefix = path.join(f.home, 'installed')
  const installed = await npm(['install', '--prefix', prefix, '--no-audit', '--no-fund', '--ignore-scripts', '--registry=https://registry.npmjs.org', '--@connected-web:registry=https://registry.npmjs.org', path.join(f.home, artifact.filename)])
  assert.equal(installed.code, 0, installed.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(prefix, 'node_modules/@connected-web/cweb/package.json')))
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0)
  const bin = path.join(prefix, 'node_modules/@connected-web/cweb/bin/cweb.mjs')
  for (const args of [['--help'], ['version'], ['plugins', '--json'], ['whoami', '--json']]) {
    const result = await run(process.execPath, [bin, ...args], { cwd: f.home, env: f.env })
    assert.equal(result.code, 0, result.stderr)
  }
})
