import { loadSession, identity } from './auth.js'
import { profileName } from './profiles.js'
import { findExecutable, nodeShim, npmCommand, runProcess, assertNotCore } from './process.js'

export const plugins = Object.freeze({
  membership: '@connected-web/cweb-membership', tasks: '@connected-web/cweb-tasks',
  files: '@connected-web/cweb-files', notes: '@connected-web/cweb-notes',
  pages: '@connected-web/cweb-pages', comments: '@connected-web/cweb-comments', support: '@connected-web/cweb-support'
})
export async function runPlugin (name, args, profile, environment) {
  if (!Object.hasOwn(plugins, name)) throw new Error(`Unknown app command: ${name}. Run cweb plugins to see available commands.`)
  const packageName = plugins[name]
  if (!packageName) throw new Error(`Unknown app command: ${name}. Run cweb plugins to see available commands.`)
  const executable = findExecutable(`cweb-${name}`)
  if (!executable) throw new Error(`${name} is not installed. Run: cweb install ${name}`)
  const command = nodeShim(executable, packageName, `cweb-${name}`)
  assertNotCore(command)
  // Put the core selection first so a plugin's explicit profile wins.
  const result = await runProcess(command.file, [...command.prefix, ...(profile ? ['--profile', profile] : []), ...(environment ? ['--environment', environment] : []), ...args], { observeStderr: true })
  if (result.code && /No authorised workspace matches|No project in .* matches/.test(result.stderr)) {
    let effectiveProfile = profile
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--profile' || args[i] === '-p') effectiveProfile = args[++i]
      else if (args[i].startsWith('--profile=')) effectiveProfile = args[i].slice(10)
    }
    const selected = profileName(effectiveProfile)
    const session = loadSession(selected)
    const user = await identity(selected, session.token?.access)
    process.stderr.write(`Signed in as ${user.email || user.sub || 'unknown'} (profile ${selected}). Check the workspace name or ask an owner for access.\n`)
  }
  return result.code
}
export async function installPackage (packageName) {
  const npm = npmCommand()
  return (await runProcess(npm.file, [...npm.prefix, 'install', '--global', `${packageName}@latest`, '--registry=https://registry.npmjs.org', '--@connected-web:registry=https://registry.npmjs.org'])).code
}
export async function installPlugin (name) {
  if (!Object.hasOwn(plugins, name)) throw new Error(`Unknown app: ${name}. Run cweb plugins to see available commands.`)
  return installPackage(plugins[name])
}
export function listPlugins (json) {
  const result = Object.entries(plugins).map(([name, packageName]) => ({ name, package: packageName, installed: Boolean(findExecutable(`cweb-${name}`)) }))
  process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : result.map(p => `${p.name}: ${p.installed ? 'installed' : 'not installed'} (${p.package})`).join('\n') + '\n')
}
