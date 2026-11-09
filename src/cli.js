import fs from 'node:fs'
import { profileName, listProfiles } from './profiles.js'
import { login, logout, whoami } from './auth.js'
import { installPackage, installPlugin, listPlugins, plugins, runPlugin } from './plugins.js'
import { isEngineeringCall, forwardEngineering } from './compatibility.js'
import { curl } from './curl.js'

const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const help = `Connected Web CLI ${version}
Usage: cweb [-p PROFILE] <command> [options]

  login                 Sign in to Global (use --interactive or --switch-account)
  logout                Clear the local CLI session
  whoami                Show the signed-in account and environment
  profiles              List saved profiles
  plugins               List available app commands and installation status
  install <app>         Install an app's CLI through npm
  <app> …               Run an installed app command; use <app> --help
  curl …                Run curl with your user session
  self-update           Update this CLI through npm
  version               Show the installed version
  help                  Show this help

Apps: ${Object.keys(plugins).join(', ')}
Sign-in options: -p/--profile NAME, --environment global|dev, --port NUMBER
Output: whoami and plugins support --json. App output follows the app's CLI.
Engineering commands have moved to cweb-eng.\n`
function value (args, i) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error(`${args[i]} needs a value.`)
  return args[i + 1]
}
export function commandLine (args) {
  let i = 0; let profile; let environment; let engineering = false
  const engineeringValues = new Set(['--user-pool-id', '--user-pool-client-id', '--user-pool-domain', '--org', '--repo', '--env', '--access', '--client-id', '--client-secret', '--oauth-url', '--auth-url', '--token-url', '--scope'])
  const engineeringFlags = new Set(['--machine', '--assume-role', '--exchange-machine-token', '--all'])
  while (i < args.length) {
    const flag = args[i].split('=')[0]
    if (args[i] === '-p' || args[i] === '--profile') { profile = value(args, i); i += 2 }
    else if (args[i].startsWith('--profile=')) { profile = args[i].slice(10); i++ }
    else if (args[i] === '--environment') { environment = value(args, i); i += 2 }
    else if (args[i].startsWith('--environment=')) { environment = args[i].slice(14); i++ }
    else if (engineeringValues.has(flag)) { engineering = true; if (!args[i].includes('=')) { value(args, i); i++ }; i++ }
    else if (engineeringFlags.has(flag)) { engineering = true; i++ }
    else if (args[i] === '--user') i++
    else break
  }
  return { command: args[i] || 'help', args: args.slice(i + 1), profile, environment, engineering }
}
function coreOptions (args) {
  const options = {}
  const booleans = new Set(['--interactive', '--browser', '--user', '--switch-account', '--get-access-token', '--json'])
  const values = new Set(['-p', '--profile', '--environment', '--port'])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (values.has(arg)) { options[arg === '-p' ? 'profile' : arg.slice(2)] = value(args, i); i++ }
    else if (booleans.has(arg)) options[arg === '--browser' ? 'interactive' : arg.slice(2)] = true
    else if (arg.startsWith('--profile=')) options.profile = arg.slice(10)
    else throw new Error(`Unknown option: ${arg}. Run cweb help.`)
  }
  if (options.port && (!/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535)) throw new Error('Port must be between 1 and 65535.')
  return options
}
export async function run (argv) {
  const parsed = commandLine(argv)
  if (parsed.engineering || isEngineeringCall(parsed.command, parsed.args)) return forwardEngineering(argv)
  if (plugins[parsed.command]) return runPlugin(parsed.command, parsed.args, parsed.profile ? profileName(parsed.profile) : undefined, parsed.environment)
  if (parsed.command === 'curl') return curl(parsed.args, profileName(parsed.profile), { environment: parsed.environment })
  if (['help', '--help', '-h'].includes(parsed.command) || parsed.args.includes('--help') || parsed.args.includes('-h')) { process.stdout.write(help); return 0 }
  if (['version', '--version', '-v'].includes(parsed.command)) { process.stdout.write(version + '\n'); return 0 }
  if (parsed.command === 'install') {
    if (parsed.args.length !== 1) throw new Error('Usage: cweb install <app>')
    return installPlugin(parsed.args[0])
  }
  const options = { environment: parsed.environment, ...coreOptions(parsed.args) }
  const profile = profileName(options.profile || parsed.profile)
  if (parsed.command === 'self-update') return installPackage('@connected-web/cweb')
  if (parsed.command === 'profiles') { process.stdout.write(listProfiles().join('\n') + '\n'); return 0 }
  if (parsed.command === 'plugins') { listPlugins(options.json); return 0 }
  if (parsed.command === 'login') { await login(profile, options); return 0 }
  if (parsed.command === 'logout') { logout(profile); return 0 }
  if (parsed.command === 'whoami') { await whoami(profile, options); return 0 }
  throw new Error(`Unknown command: ${parsed.command}. Run cweb help.`)
}
