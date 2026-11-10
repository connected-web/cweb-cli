import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fixture, jwt, run, session } from './helpers.js'

async function server (t, handler) {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  return `http://127.0.0.1:${server.address().port}`
}
test('clean Global settings, legacy cache, refresh and identity display use the intended pool', async t => {
  const f = fixture(t)
  let base; let refreshes = 0
  base = await server(t, async (req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/auth-config.json') {
      res.end(JSON.stringify({ environment: 'global', identity: { oauthUrl: base, issuerUrl: base + '/pool', cognitoUserPoolClientId: 'global-client' } }))
    } else if (req.url === '/oauth2/token') {
      let body = ''; for await (const chunk of req) body += chunk
      assert.equal(new URLSearchParams(body).get('refresh_token'), 'existing-refresh')
      refreshes++
      res.end(JSON.stringify({ access_token: jwt({ iss: base + '/pool', client_id: 'global-client' }), refresh_token: 'rotated-refresh', id_token: jwt({ email: 'codex@example.test', name: 'Codex User' }) }))
    } else if (req.url === '/oauth2/userInfo') {
      assert.match(req.headers.authorization, /^Bearer /)
      res.end(JSON.stringify({ sub: 'user-one', email: 'codex@example.test', name: 'Codex User' }))
    } else { res.writeHead(404).end('{}') }
  })
  f.env.CWEB_AUTH_CONFIG_URL = base + '/auth-config.json'
  session(f.home, 'new-global', { token: { access: jwt({ exp: 1 }), expiresAt: 1 }, refresh: { token: 'existing-refresh' } })
  const result = await f.exec(['login', '-p', 'new-global'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /codex@example.test/)
  assert.match(result.stdout, /Environment: global/)
  assert.equal(refreshes, 1)
  const config = JSON.parse(fs.readFileSync(path.join(f.accounts, 'new-global.json')))
  assert.equal(config.identity.clientId, 'global-client')
  assert.equal(config.identity.oauthUrl, base)
  const stored = fs.readFileSync(path.join(f.home, '.cweb/profiles/new-global/info.json'), 'utf8')
  assert.equal(JSON.parse(stored).version, 2)
  assert.ok(!stored.includes('rotated-refresh'))
  const who = await f.exec(['whoami', '-p', 'new-global', '--json'])
  const identity = JSON.parse(who.stdout)
  assert.equal(identity.user.email, 'codex@example.test')
  assert.equal(identity.user.username, 'user-one')
  assert.equal(refreshes, 1)
})
test('an invalid refresh grant clears user tokens while preserving engineering credentials', async t => {
  const f = fixture(t)
  const base = await server(t, (req, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}') })
  fs.writeFileSync(path.join(f.accounts, 'fixture.json'), JSON.stringify({ environment: 'global', identity: { oauthUrl: base, clientId: 'client' } }))
  session(f.home, 'fixture', { token: { access: jwt({ exp: 1 }), expiresAt: 1 }, refresh: { token: 'rejected-grant' }, machine: { clientId: 'engineering-id', clientSecret: 'fixture-secret' } })
  const result = await f.exec(['whoami', '-p', 'fixture', '--json'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /sign in again/)
  assert.ok(!result.stderr.includes('fixture-secret'))
  const who = await f.exec(['whoami', '-p', 'fixture', '--json'])
  assert.equal(JSON.parse(who.stdout).user.cached, false)
})
test('public curl selects the explicit profile and forwards data without corrupting stdout', async t => {
  const f = fixture(t)
  const chosenToken = jwt({ sub: 'chosen-user' })
  const base = await server(t, async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${chosenToken}`)
    let data = ''; for await (const chunk of req) data += chunk
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ body: data }))
  })
  session(f.home, 'chosen', { token: { access: chosenToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 } })
  const body = '{"literal":"$(not-a-command) & `text`"}'
  const result = await f.exec(['-p', 'wrong', 'curl', '--user', '-p', 'chosen', '-sS', '-X', 'POST', '--data', body, base])
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { body })
})

test('whoami resolves an email for an existing access-token-only profile', async t => {
  const f = fixture(t)
  const base = await server(t, (req, res) => {
    assert.equal(req.url, '/oauth2/userInfo')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ sub: 'user-one', email: 'legacy@example.test' }))
  })
  fs.writeFileSync(path.join(f.accounts, 'legacy.json'), JSON.stringify({ environment: 'global', identity: { oauthUrl: base, clientId: 'client' } }))
  session(f.home, 'legacy', { token: { access: jwt(), expiresAt: Math.floor(Date.now() / 1000) + 3600 } })
  const result = await f.exec(['whoami', '-p', 'legacy', '--json'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).user.email, 'legacy@example.test')
})

test('account switching rejects the same subject and preserves the old session until a different sign-in succeeds', async t => {
  const f = fixture(t)
  const base = await server(t, async (req, res) => {
    assert.equal(req.url, '/oauth2/token')
    let body = ''
    for await (const chunk of req) body += chunk
    const sub = new URLSearchParams(body).get('code')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ access_token: jwt({ sub }), id_token: jwt({ sub, email: 'account@example.test' }) }))
  })
  fs.writeFileSync(path.join(f.accounts, 'switch.json'), JSON.stringify({ environment: 'global', identity: { oauthUrl: base, clientId: 'client' } }))
  session(f.home, 'switch', { token: { access: jwt() }, refresh: { token: 'old-refresh' }, machine: { clientId: 'engineering-id' } })
  const result = await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { loadSession, login } from ${JSON.stringify(new URL('../src/auth.js', import.meta.url).href)}
    const switchTo = code => login('switch', { 'switch-account': true, json: true }, async ({ complete }) => complete({
      code, verifier: 'fixture-verifier', redirectUri: 'http://localhost:12025/'
    }))
    await assert.rejects(switchTo('user-one'), /fresh private window/)
    assert.equal(loadSession('switch').refresh.token, 'old-refresh')
    await switchTo('user-two')
    const current = loadSession('switch')
    assert.equal(current.user.sub, 'user-two')
    assert.equal(current.refresh.token, '')
    assert.equal(current.machine.clientId, 'engineering-id')
  `], { env: f.env, cwd: f.home })
  assert.equal(result.code, 0, result.stderr)
})
