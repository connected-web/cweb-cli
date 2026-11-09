import { accessToken } from './auth.js'
import { findExecutable, runProcess } from './process.js'

export function curlArguments (args, initialProfile) {
  let profile = initialProfile
  const forwarded = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-p' || arg === '--profile') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error(`${arg} needs a profile name.`)
      profile = args[++i]
    } else if (arg.startsWith('--profile=')) profile = arg.slice(10)
    else if (arg !== '--user') forwarded.push(arg)
  }
  return { profile, forwarded }
}
export async function curl (args, profile, options) {
  const parsed = curlArguments(args, profile)
  const token = await accessToken(parsed.profile, options)
  const executable = findExecutable('curl')
  if (!executable) throw new Error('curl was not found. Install curl and retry this command.')
  return (await runProcess(executable, ['-H', `authorization: Bearer ${token}`, ...parsed.forwarded])).code
}
