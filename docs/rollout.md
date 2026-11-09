# Rollout checklist

- [ ] Engineering package is published and installed, and known callers use it.
- [ ] Public core and domain packages can be installed from npmjs.org without
      organisation credentials, including transitive dependencies.
- [ ] Stop both release and PR publishers for @connected-web/cweb in the platform
      repository. Keep cweb-eng publishing independent.
- [ ] Confirm npm package ownership and configure npm trusted publishing for
      owner `connected-web`, repository `cweb-cli`, workflow `publish.yml`,
      environment `public`. Only then enable CWEB_PUBLIC_PUBLISH_ENABLED.
- [ ] Publish the public major-version candidate under next.
- [ ] Install the candidate with a clean home. Sign in, switch accounts, discover
      workspaces and exercise Membership, Tasks, Files and Notes in disposable data.
- [ ] Verify the intended actor on a task edit/comment. Record browser sign-in and
      permission failures as well as the successful journey.
- [ ] Publish stable from main and update installation docs/skills.
- [ ] Retain the prior package version for rollback. Profile/cache format stays
      compatible; do not remove user caches during upgrades or rollback.
- [ ] Announce the later major version that will remove engineering forwarding.

Related work:
- [CLI split](https://tasks.connected-web.net/w/connected-web/platform-development/tasks?board=all-work&viewTask=TASK-338)
- [Public release](https://tasks.connected-web.net/w/connected-web/platform-development/tasks?board=all-work&viewTask=TASK-8)
- [Account display and switching](https://tasks.connected-web.net/w/connected-web/platform-development/tasks?board=all-work&viewTask=TASK-340)
- [Common CLI conventions](https://tasks.connected-web.net/w/connected-web/platform-development/tasks?board=all-work&viewTask=TASK-267)
