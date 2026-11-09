import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = () => path.join(os.homedir(), '.cweb')
export const accountsDirectory = () => process.env.CWEB_ACCOUNTS_DIR || path.join(root(), 'accounts')
function aliases () {
  try { return JSON.parse(fs.readFileSync(path.join(root(), 'state.json'), 'utf8')).profileAliases || {} } catch { return {} }
}
export function profileName (name = 'connected-web-global') {
  const mapped = aliases()[name] || ({ global: 'connected-web-global', dev: 'connected-web-dev', org: 'connected-web-org' })[name] || name
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(mapped)) throw new Error('A profile name must contain only letters, numbers, dots, underscores or hyphens.')
  return mapped
}
export function readProfile (name) {
  const file = path.join(accountsDirectory(), `${profileName(name)}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
export function validateHttpUrl (value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Use HTTPS, or HTTP on localhost for testing.')
  }
  if (url.username || url.password) throw new Error('URLs must not include credentials.')
  return url
}
export async function ensureProfile (name, environment) {
  const existing = readProfile(name)
  if (existing) {
    if (environment && existing.environment !== environment) throw new Error(`Profile ${name} uses ${existing.environment}; choose another profile for ${environment}.`)
    if (!existing.identity?.oauthUrl || !existing.identity?.clientId) throw new Error(`Profile ${name} has no user sign-in configuration. Use a new profile or repair its identity settings.`)
    validateHttpUrl(existing.identity.oauthUrl)
    return existing
  }
  const env = environment || 'global'
  if (!['dev', 'global'].includes(env)) throw new Error('Environment must be dev or global.')
  const url = process.env.CWEB_AUTH_CONFIG_URL || `https://membership-ui.${env}.connected-web.services/auth-config.json`
  validateHttpUrl(url)
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Cannot load ${env} sign-in settings (HTTP ${response.status}).`)
  const data = await response.json()
  const identity = data.identity
  if (data.environment !== env || !identity?.oauthUrl || !identity?.cognitoUserPoolClientId || !identity?.issuerUrl) {
    throw new Error(`Sign-in settings do not describe ${env}; no profile was written.`)
  }
  validateHttpUrl(identity.oauthUrl); validateHttpUrl(identity.issuerUrl)
  const config = {
    accountName: profileName(name), environment: env, parentZone: 'connected-web.services',
    identity: { oauthUrl: identity.oauthUrl, clientId: identity.cognitoUserPoolClientId, issuerUrl: identity.issuerUrl, scopes: 'openid email profile' }
  }
  fs.mkdirSync(accountsDirectory(), { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(accountsDirectory(), `${config.accountName}.json`), JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  return config
}
export function listProfiles () {
  const names = new Set()
  for (const [directory, kind] of [[accountsDirectory(), 'accounts'], [path.join(root(), 'profiles'), 'profiles']]) {
    if (!fs.existsSync(directory)) continue
    for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
      if (kind === 'accounts' && file.isFile() && file.name.endsWith('.json')) names.add(file.name.slice(0, -5))
      if (kind === 'profiles' && file.isDirectory()) names.add(file.name)
    }
  }
  return [...names].sort()
}
