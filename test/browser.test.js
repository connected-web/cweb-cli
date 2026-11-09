import assert from 'node:assert/strict'
import { test } from 'node:test'
import crypto from 'node:crypto'
import { browserLogin } from '../src/browser.js'

test('browser sign-in rejects a wrong state and returns the PKCE code', async () => {
  let opened
  const pending = browserLogin({ oauthUrl: 'https://example.com', clientId: 'client', scopes: 'openid email', port: 0, open: url => { opened = new URL(url) } })
  while (!opened) await new Promise(resolve => setTimeout(resolve, 5))
  const redirect = new URL(opened.searchParams.get('redirect_uri'))
  redirect.hostname = '127.0.0.1'
  redirect.search = new URLSearchParams({ code: 'bad', state: 'wrong' })
  assert.equal((await fetch(redirect)).status, 400)
  redirect.search = new URLSearchParams({ code: 'good', state: opened.searchParams.get('state') })
  assert.equal((await fetch(redirect)).status, 200)
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
  assert.notEqual(authorize.searchParams.get('state'), opened.searchParams.get('state'))
  assert.ok(authorize.searchParams.get('code_challenge'))
  callback.search = new URLSearchParams({ code: 'real-code', state: authorize.searchParams.get('state') })
  await fetch(callback)
  assert.equal((await pending).code, 'real-code')
})
test('a failed sign-in closes the callback listener', async () => {
  await assert.rejects(browserLogin({ oauthUrl: 'https://example.com', clientId: 'client', scopes: 'openid', port: 0, timeout: 20, open: () => {} }), /Timed out/)
})
