import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

export function findExecutable (name) {
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue
    for (const extension of extensions) {
      const file = path.resolve(directory, name + extension)
      try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file } catch {}
    }
  }
  return null
}
export function nodeShim (file, packageName, binName) {
  if (!/\.(cmd|bat)$/i.test(file)) return { file, prefix: [] }
  const root = path.join(path.dirname(file), 'node_modules', ...packageName.split('/'))
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName]
  if (typeof bin !== 'string') throw new Error(`Cannot find the Node entrypoint for ${packageName}. Reinstall it with npm.`)
  const target = path.resolve(root, bin)
  if (!target.startsWith(root + path.sep)) throw new Error('Package executable is outside its package directory.')
  return { file: process.execPath, prefix: [target] }
}
export function npmCommand () {
  const npm = findExecutable('npm')
  if (!npm) throw new Error('npm was not found. Install Node LTS with npm, then try again.')
  return nodeShim(npm, 'npm', 'npm')
}
export function runProcess (command, args, { capture = false, observeStderr = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: capture ? ['inherit', 'pipe', 'pipe'] : observeStderr ? ['inherit', 'inherit', 'pipe'] : 'inherit', shell: false })
    let stdout = ''; let stderr = ''
    if (capture) {
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
    }
    if (observeStderr) child.stderr.on('data', chunk => {
      process.stderr.write(chunk)
      stderr = (stderr + chunk).slice(-8192)
    })
    const forwards = ['SIGINT', 'SIGTERM'].map(signal => {
      const handler = () => child.kill(signal)
      process.on(signal, handler)
      return [signal, handler]
    })
    const cleanup = () => forwards.forEach(([signal, handler]) => process.off(signal, handler))
    child.on('error', error => { cleanup(); reject(error) })
    child.on('close', (code, signal) => {
      cleanup()
      resolve({ code: code ?? 128 + (os.constants.signals[signal] || 1), stdout, stderr })
    })
  })
}
