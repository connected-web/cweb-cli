import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { loginSuccessPage } from './browser-page.js'

export function openBrowser (url) {
  let wsl = false
  try { wsl = fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft') } catch {}
  let command; let args
  if (process.platform === 'win32' || wsl) {
    command = 'powershell.exe'
    args = ['-NoProfile', '-Command', `Start-Process '${url.replaceAll("'", "''")}'`]
  } else if (process.platform === 'darwin') { command = 'open'; args = [url] } else { command = 'xdg-open'; args = [url] }
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => process.stderr.write(`Open this address in your browser:\n${url}\n`))
  child.unref()
}

export function browserLogin ({ oauthUrl, clientId, scopes, switchAccount = false, port = 12025, timeout = 180000, open = openBrowser }) {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const state = crypto.randomBytes(24).toString('base64url')
  const logoutState = crypto.randomBytes(24).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return new Promise((resolve, reject) => {
    let stage = switchAccount ? 'logout' : 'login'
    let timer; let redirectUri; let authorize; let logout
    const cookieName = `cweb-switch-${logoutState.slice(0, 12)}`
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      if (stage === 'complete') { res.writeHead(410).end(); return }
      if (stage === 'logout' && url.pathname === '/start-switch') {
        if (url.searchParams.get('state') !== logoutState) { res.writeHead(400).end('Invalid account-switch state.'); return }
        res.writeHead(302, {
          location: logout.toString(),
          'set-cookie': `${cookieName}=${logoutState}; Path=/; HttpOnly; SameSite=Lax; Max-Age=180`
        }).end()
        return
      }
      if (url.pathname !== '/') { res.writeHead(404).end(); return }
      if (stage === 'logout') {
        const cookies = (req.headers.cookie || '').split(';').map(value => value.trim())
        if (!cookies.includes(`${cookieName}=${logoutState}`)) { res.writeHead(400).end('Invalid account-switch state.'); return }
        stage = 'login'
        res.writeHead(302, {
          location: authorize.toString(),
          'set-cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
        }).end()
        return
      }
      if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid sign-in state.'); return }
      if (url.searchParams.has('error')) {
        stage = 'complete'
        const error = new Error(`Sign-in failed: ${url.searchParams.get('error')}`)
        res.writeHead(400, { connection: 'close' }).end('Sign-in was not completed.', () => finish(error))
        return
      }
      const code = url.searchParams.get('code')
      if (!code) { res.writeHead(400).end('Missing sign-in code.'); return }
      stage = 'complete'
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        connection: 'close'
      }).end(loginSuccessPage, () => finish(null, { code, verifier, redirectUri }))
    })
    function finish (error, result) {
      clearTimeout(timer); server.close()
      // A browser preconnection with no request can outlive server.close().
      server.closeAllConnections()
      if (error) reject(error); else resolve(result)
    }
    server.on('error', error => finish(new Error(`Cannot listen for sign-in: ${error.message}`)))
    server.listen(port, '127.0.0.1', () => {
      redirectUri = `http://localhost:${server.address().port}/`
      authorize = new URL('/oauth2/authorize', oauthUrl)
      authorize.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: scopes, state, code_challenge_method: 'S256', code_challenge: challenge }).toString()
      let start = authorize
      if (switchAccount) {
        authorize.searchParams.set('prompt', 'login')
        logout = new URL('/logout', oauthUrl)
        logout.search = new URLSearchParams({ client_id: clientId, logout_uri: redirectUri }).toString()
        // Bind the logout return to this browser with a short-lived local cookie.
        // Logout issues no authorization code; only the following PKCE flow does.
        start = new URL('/start-switch', redirectUri)
        start.search = new URLSearchParams({ state: logoutState }).toString()
      }
      timer = setTimeout(() => finish(new Error(`Timed out waiting for sign-in. Check that ${redirectUri} is an allowed callback${switchAccount ? ' and sign-out URL' : ''}, then run cweb login again.`)), timeout)
      process.stderr.write(`Opening ${switchAccount ? 'account switch' : 'sign-in'} in your browser.\n`)
      try { open(start.toString()) } catch (error) { finish(error) }
    })
  })
}
