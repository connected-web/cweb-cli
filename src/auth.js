import { ensureProfile, profileName, readProfile } from './profiles.js'
import { loadProfileInfo, saveProfileInfo, decodeJwtPayload, isTokenValid } from './profile-storage.js'
import { browserLogin } from './browser.js'

export const loadSession = profile => loadProfileInfo(profileName, profile)
export const saveSession = (profile, data) => saveProfileInfo(profileName, profile, data)
function removeUserSession (profile) {
  const info = loadSession(profile)
  delete info.token; delete info.refresh; delete info.user
  saveSession(profile, info)
}
export function logout (profile) {
  removeUserSession(profile)
  process.stdout.write(`Signed out of ${profile}. This clears the CLI session; use cweb login --switch-account to change the browser account.\n`)
}
async function tokenRequest (config, body) {
  const response = await fetch(new URL('/oauth2/token', config.identity.oauthUrl), {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(15000)
  })
  let data = {}
  try { data = await response.json() } catch {}
  if (!response.ok || !data.access_token) {
    const error = new Error(`Sign-in token request failed (HTTP ${response.status}). Run cweb login --interactive to sign in again.`)
    error.code = data.error
    throw error
  }
  return data
}
function storeTokens (profile, data, previous = loadSession(profile)) {
  const claims = decodeJwtPayload(data.access_token)
  const idClaims = data.id_token ? decodeJwtPayload(data.id_token) : {}
  const user = idClaims.sub === claims.sub ? {
    sub: claims.sub, email: idClaims.email || null, name: idClaims.name || null
  } : previous.user?.sub === claims.sub ? previous.user : undefined
  if (!user) delete previous.user
  saveSession(profile, {
    ...previous, token: { access: data.access_token, expiresAt: claims.exp || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) },
    refresh: { token: data.refresh_token || previous.refresh?.token || '' },
    ...(user ? { user } : {}), updatedAt: new Date().toISOString()
  })
  return data.access_token
}
export async function accessToken (profile, options = {}) {
  const info = loadSession(profile)
  if (isTokenValid(info.token?.access, info.token?.expiresAt)) return info.token.access
  if (info.refresh?.token) {
    const config = await ensureProfile(profile, options.environment)
    try {
      const data = await tokenRequest(config, { grant_type: 'refresh_token', client_id: config.identity.clientId, refresh_token: info.refresh.token })
      return storeTokens(profile, data, info)
    } catch (error) {
      if (error.code === 'invalid_grant' || error.code === 'invalid_client') removeUserSession(profile)
      throw error
    }
  }
  throw new Error(`No valid user session for ${profile}. Run: cweb login -p ${profile} --interactive`)
}
export async function identity (profile, token) {
  const claims = decodeJwtPayload(token)
  let user = loadSession(profile).user
  if (user?.sub !== claims.sub) user = undefined
  if (token && !user?.email) {
    const config = readProfile(profile)
    if (config?.identity?.oauthUrl) {
      try {
        const response = await fetch(new URL('/oauth2/userInfo', config.identity.oauthUrl), {
          headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000)
        })
        if (response.ok) {
          const data = await response.json()
          if (data.sub === claims.sub) {
            user = { sub: data.sub, email: data.email || null, name: data.name || null }
            // Identity lookup is read-only. Login caches ID-token attributes;
            // a slow userInfo lookup must not overwrite a newly refreshed session.
          }
        }
      } catch { /* Identity lookup is optional; the subject remains visible. */ }
    }
  }
  return { sub: claims.sub || claims.username || null, email: user?.email || claims.email || null, name: user?.name || null, issuer: claims.iss || null, clientId: claims.client_id || null }
}
export async function whoami (profile, { json = false, environment } = {}) {
  const session = loadSession(profile)
  let token = null
  if (session.token || session.refresh?.token) token = await accessToken(profile, { environment })
  const config = readProfile(profile)
  const user = token ? await identity(profile, token) : { sub: null, email: null, name: null, issuer: null, clientId: null }
  const result = {
    profile, environment: config?.environment || environment || 'global',
    tokenSource: token ? 'user (cached)' : 'none',
    user: { cached: Boolean(token), valid: Boolean(token), expiresAt: loadSession(profile).token?.expiresAt || null, username: user.sub, scope: token ? decodeJwtPayload(token).scope || null : null, ...user }
  }
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  else process.stdout.write(`Profile: ${profile}\nEnvironment: ${result.environment}\nSigned in as: ${user.email || user.sub || 'not signed in'}${user.name ? ` (${user.name})` : ''}\nSubject: ${user.sub || 'none'}\nIssuer: ${user.issuer || 'none'}\n`)
  return result
}
export async function login (profile, options = {}) {
  const config = await ensureProfile(profile, options.environment)
  if (!options.interactive && !options['switch-account']) {
    try {
      const token = await accessToken(profile, options)
      if (options['get-access-token']) { process.stdout.write(token); return }
      return whoami(profile, options)
    } catch (error) {
      if (!process.stdin.isTTY) throw error
    }
  }
  if (options['switch-account']) removeUserSession(profile)
  const result = await browserLogin({ oauthUrl: config.identity.oauthUrl, clientId: config.identity.clientId, scopes: config.identity.scopes || 'openid email profile', switchAccount: Boolean(options['switch-account']), port: options.port ? Number(options.port) : 12025 })
  const data = await tokenRequest(config, { grant_type: 'authorization_code', client_id: config.identity.clientId, code: result.code, code_verifier: result.verifier, redirect_uri: result.redirectUri })
  storeTokens(profile, data)
  if (options['get-access-token']) { process.stdout.write(data.access_token); return }
  return whoami(profile, options)
}
