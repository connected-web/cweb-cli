import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
for (const directory of ['src', 'bin', 'scripts', 'test']) {
  for (const file of fs.readdirSync(directory)) {
    if (!/\.(m?js)$/.test(file)) continue
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status || 1)
  }
}
