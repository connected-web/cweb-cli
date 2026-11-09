import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

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
    let timer; let redirectUri; let authorize
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname !== '/') { res.writeHead(404).end(); return }
      const expected = stage === 'logout' ? logoutState : state
      if (url.searchParams.get('state') !== expected) { res.writeHead(400).end('Invalid sign-in state.'); return }
      if (url.searchParams.has('error')) {
        res.writeHead(400).end('Sign-in was not completed.')
        finish(new Error(`Sign-in failed: ${url.searchParams.get('error')}`)); return
      }
      const code = url.searchParams.get('code')
      if (!code) { res.writeHead(400).end('Missing sign-in code.'); return }
      if (stage === 'logout') {
        // Cognito supports redirect_uri on /logout even when the client has no
        // loopback LogoutURL. Discard that flow's code, then start our PKCE flow.
        stage = 'login'
        res.writeHead(302, { location: authorize.toString() }).end(); return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Connected Web</title><h1>Signed in</h1><p>You can return to your terminal and close this tab.</p>')
      finish(null, { code, verifier, redirectUri })
    })
    function finish (error, result) {
      clearTimeout(timer); server.close()
      if (error) reject(error); else resolve(result)
    }
    server.on('error', error => finish(new Error(`Cannot listen for sign-in: ${error.message}`)))
    server.listen(port, '127.0.0.1', () => {
      redirectUri = `http://localhost:${server.address().port}/`
      authorize = new URL('/oauth2/authorize', oauthUrl)
      authorize.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: scopes, state, code_challenge_method: 'S256', code_challenge: challenge }).toString()
      let start = authorize
      if (switchAccount) {
        start = new URL('/logout', oauthUrl)
        start.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes, state: logoutState }).toString()
      }
      timer = setTimeout(() => finish(new Error('Timed out waiting for sign-in. Run cweb login again.')), timeout)
      process.stderr.write(`Opening ${switchAccount ? 'account switch' : 'sign-in'} in your browser.\n`)
      try { open(start.toString()) } catch (error) { finish(error) }
    })
  })
}
