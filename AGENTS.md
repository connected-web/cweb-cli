# Public Connected Web CLI

Use plain English. This repository owns the public `@connected-web/cweb` npm
package. Platform engineering commands live in `connected-web-aws` as cweb-eng.
Domain commands stay in their app repositories.

Source nvm before Node/npm in WSL. Use Node LTS and no runtime npm dependencies.
Run `npm test` and `npm run check` before committing. Test the packed artifact,
not just imports. Tests use temporary homes and local APIs, never real profiles.

Keep versions at 0.0.0 in source; release workflows set artifact versions.
Preserve existing encrypted profiles and direct domain CLI use. Never put tokens
in logs. Follow the coding-pr skill and link task references.

Publishing the public replacement requires the old platform publisher to be
stopped first. Confirm that handover before releasing, even if tests pass.
