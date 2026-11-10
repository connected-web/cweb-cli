import assert from 'node:assert/strict'
import { test } from 'node:test'
import crypto from 'node:crypto'
import { once } from 'node:events'
import net from 'node:net'
import { browserLogin } from '../src/browser.js'

test('browser sign-in rejects a wrong state, serves the styled page and closes preconnections', async t => {
  let opened
  const pending = browserLogin({ oauthUrl: 'https://example.com', clientId: 'client', scopes: 'openid email', port: 0, open: url => { opened = new URL(url) } })
  while (!opened) await new Promise(resolve => setTimeout(resolve, 5))
  const redirect = new URL(opened.searchParams.get('redirect_uri'))
  redirect.hostname = '127.0.0.1'
  redirect.search = new URLSearchParams({ code: 'bad', state: 'wrong' })
  assert.equal((await fetch(redirect)).status, 400)
  const preconnection = net.createConnection({ host: redirect.hostname, port: Number(redirect.port) })
  t.after(() => preconnection.destroy())
  await once(preconnection, 'connect')
  const closed = once(preconnection, 'close', { signal: AbortSignal.timeout(3000) })
  redirect.search = new URLSearchParams({ code: 'good', state: opened.searchParams.get('state') })
  const response = await fetch(redirect)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const page = await response.text()
  assert.match(page, /<style>/)
  assert.match(page, /Connected Web login complete/)
  await closed
  const result = await pending
  assert.equal(result.code, 'good')
  assert.equal(crypto.createHash('sha256').update(result.verifier).digest('base64url'), opened.searchParams.get('code_challenge'))
})
test('switch-account clears browser SSO before starting a separate PKCE login', async () => {
  let opened
  const pending = browserLogin({ oauthUrl: 'https://example.com', clientId: 'client', scopes: 'openid', switchAccount: true, port: 0, open: url => { opened = new URL(url) } })
  while (!opened) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(opened.pathname, '/start-switch')
  const localStart = new URL(opened); localStart.hostname = '127.0.0.1'
  const begin = await fetch(localStart, { redirect: 'manual' })
  assert.equal(begin.status, 302)
  const logout = new URL(begin.headers.get('location'))
  assert.equal(logout.pathname, '/logout')
  assert.equal(logout.searchParams.has('response_type'), false)
  assert.equal(logout.searchParams.has('redirect_uri'), false)
  const cookie = begin.headers.get('set-cookie').split(';')[0]
  const callback = new URL(logout.searchParams.get('logout_uri')); callback.hostname = '127.0.0.1'
  assert.equal((await fetch(callback, { redirect: 'manual' })).status, 400)
  const transition = await fetch(callback, { redirect: 'manual', headers: { cookie } })
  assert.equal(transition.status, 302)
  assert.match(transition.headers.get('set-cookie'), /Max-Age=0/)
  const authorize = new URL(transition.headers.get('location'))
  assert.equal(authorize.pathname, '/oauth2/authorize')
  assert.equal(authorize.searchParams.get('prompt'), 'login')
  assert.notEqual(authorize.searchParams.get('state'), opened.searchParams.get('state'))
  assert.ok(authorize.searchParams.get('code_challenge'))
  callback.search = new URLSearchParams({ code: 'real-code', state: authorize.searchParams.get('state') })
  await fetch(callback)
  assert.equal((await pending).code, 'real-code')
})
test('a failed sign-in closes the callback listener', async () => {
  await assert.rejects(browserLogin({ oauthUrl: 'https://example.com', clientId: 'client', scopes: 'openid', port: 0, timeout: 20, open: () => {} }), /Timed out/)
})

test('manual browser sign-in prints a link and shows failure when the CLI rejects the result', async t => {
  let output = ''
  let launched = false
  const stderr = t.mock.method(process.stderr, 'write', message => { output += message; return true })
  const pending = browserLogin({
    oauthUrl: 'https://example.com',
    clientId: 'client',
    scopes: 'openid',
    noBrowser: true,
    port: 0,
    timeout: 3000,
    open: () => { launched = true },
    complete: async () => { throw new Error('same account') }
  })
  const rejected = assert.rejects(pending, /same account/)
  while (!output && !launched) await new Promise(resolve => setTimeout(resolve, 5))
  stderr.mock.restore()
  assert.equal(launched, false)
  assert.match(output, /fresh private browser window/)
  const start = new URL(output.trim().split('\n').at(-1))
  const callback = new URL(start.searchParams.get('redirect_uri'))
  callback.hostname = '127.0.0.1'
  callback.search = new URLSearchParams({ code: 'real-code', state: start.searchParams.get('state') })
  const response = await fetch(callback)
  assert.equal(response.status, 400)
  const page = await response.text()
  assert.match(page, /Connected Web login not completed/)
  assert.doesNotMatch(page, /Your authentication was successful|same account/)
  await rejected
})
