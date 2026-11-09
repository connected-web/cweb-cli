import { findExecutable, nodeShim, runProcess } from './process.js'

const engineeringCommands = new Set(['configure', 'sync-accounts', 'repo', 'platform-bootstrap', 'credentials', 'package', 'deployments', 'provisioning', 'release', 'services', 'logs'])
export function isEngineeringCall (command, args) {
  if (engineeringCommands.has(command)) return true
  if (!['login', 'logout', 'curl'].includes(command)) return false
  return args.some(arg => ['--machine', '--assume-role', '--exchange-machine-token', '--all'].some(flag => arg === flag || arg.startsWith(flag + '=')))
}
export async function forwardEngineering (args) {
  process.stderr.write('This engineering command has moved to cweb-eng. Update your command before the next public major release.\n')
  const file = findExecutable('cweb-eng')
  if (!file) throw new Error('Install the engineering CLI: npm install -g @connected-web/cweb-eng --@connected-web:registry=https://npm.pkg.github.com')
  const target = nodeShim(file, '@connected-web/cweb-eng', 'cweb-eng')
  return (await runProcess(target.file, [...target.prefix, ...args])).code
}
