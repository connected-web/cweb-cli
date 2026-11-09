# Connected Web CLI

Sign in to Connected Web and use your apps from the terminal.

Requires Node LTS 22, 24 or 26, npm and `curl`. Linux, macOS and Windows are tested.
No platform source checkout, TypeScript loader or engineering CLI is needed for
normal app commands.

## Install and sign in

```sh
npm install -g @connected-web/cweb@next --registry=https://registry.npmjs.org --@connected-web:registry=https://registry.npmjs.org
cweb login --interactive
cweb whoami
cweb install tasks
cweb tasks workspaces
cweb tasks list personal/default --json
```

The current public release is a candidate under `next`. App packages are being
prepared for npmjs.org; check their availability before relying on `cweb install`.

New profiles use Global's deployed sign-in configuration. Use a separate profile
for development:

```sh
cweb login -p my-dev --environment dev --interactive
cweb -p my-dev tasks workspaces
```

`cweb whoami` shows your email, subject, environment and actual token issuer.
`cweb whoami --json` provides the same details in JSON. If the identity service
cannot provide an email, the subject remains visible. Profile names are labels;
an existing profile retains its configured identity provider. Check the issuer
when using an old profile that was configured for a different environment.

## Switch accounts

```sh
cweb login --switch-account
cweb whoami
```

This signs out the browser's Cognito session before asking you to sign in again.
It replaces the selected CLI user session and preserves engineering credentials.
Ordinary `cweb logout` clears only the local user session. Federated providers may
have their own session; choose the intended account there too.

The browser callback uses `http://localhost:12025/`. That address must be an
allowed callback and sign-out URL for account switching. Managed Connected Web
clients register both. `--port` supports another registered
loopback port. The switch flow returns from Cognito logout before starting a PKCE sign-in.
A short-lived localhost cookie keeps the logout return in the same browser.

## App commands

`cweb plugins` lists supported apps and installation status. Each app owns its
commands and documentation:

```sh
cweb install membership
cweb install files
cweb install notes
cweb tasks --help
cweb files --help
cweb notes --help
```

Membership, Tasks, Files, Notes, Pages, Comments and Support are supported. Operator
commands still require the appropriate permissions. Use `cweb <app> --help` for
commands, paging, JSON output and write previews. Existing `cweb-tasks` and other
direct commands continue working.

An explicit core profile is passed to the app first. A profile supplied to the
app command overrides it. App arguments, help and exit codes are preserved.

```sh
cweb -p my-profile tasks list personal/default --all --json
cweb -p my-profile curl --user -sS https://tasks-api.global.connected-web.services/status
```

`cweb curl` retains the request interface used by domain tools. Your access token
is added to the request; stdout belongs to curl. Use only a destination you intend
to authenticate to. Sessions refresh automatically. A rejected refresh grant
clears the user session and asks you to sign in again.

Existing encrypted `~/.cweb/profiles` are compatible. Public profiles are stored
under `~/.cweb/accounts`; `CWEB_ACCOUNTS_DIR` selects another config directory.
`CWEB_AUTH_CONFIG_URL` can select a deployed configuration endpoint for testing.
Configuration and identity endpoints require HTTPS, except on localhost.

## Engineering migration

Platform bootstrap, packaging, deployments, provisioning, credentials, release,
services, logs and account setup belong to `cweb-eng`. Legacy calls forward to
that executable for the first public major release. Warnings go to stderr; JSON
stdout and exit codes remain usable. Engineering login/curl flags also forward.

```sh
npm install -g @connected-web/cweb-eng --@connected-web:registry=https://npm.pkg.github.com
cweb-eng --help
```

Engineering package installation uses your organisation's GitHub Packages access.
It is independent of public app use. Remove legacy forwarding only in a later
major release after known callers have migrated.

## Development and release

```sh
npm ci
npm test
npm run check
```

Tests use temporary profiles and local APIs, including refresh, account switching,
plugin arguments, engineering forwarding and the installed npm artifact. CI runs
on the supported Node LTS versions and operating systems.

Versions remain `0.0.0` in source. Publishing requires the platform repository to
stop publishing `@connected-web/cweb` first. The manual release workflow also
requires `CWEB_PUBLIC_PUBLISH_ENABLED=true` and npm trusted publishing for `connected-web/cweb-cli`, workflow `publish.yml`,
environment `public`. No npm token secret is used.
Start with an explicit prerelease and the `next` tag. Stable releases use `main`.
No infrastructure is deployed. See [the rollout checklist](docs/rollout.md).

Platform binaries and local export/sync can follow later. The npm entrypoint is
small so distribution can change without changing the command implementation.
