import { checked } from '../src/infrastructure/process'

export function npm(args: string[], cwd = process.cwd()): Promise<string> {
  const cli = process.env.npm_execpath

  if (cli?.endsWith('npm-cli.js')) return checked('node', [cli, ...args], { cwd })

  if (process.platform === 'win32') {
    const quoted = args.map((argument) => `"${argument.replaceAll('"', '""')}"`).join(' ')
    const command = `npm ${quoted}`

    return checked('cmd.exe', ['/d', '/s', '/c', command], { cwd })
  }

  return checked('npm', args, { cwd })
}
