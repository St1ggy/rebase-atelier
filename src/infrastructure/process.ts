import { spawn } from 'node:child_process'

export type RunResult = { code: number; stdout: string; stderr: string }
export type RunOptions = { cwd: string; env?: Record<string, string>; interactive?: boolean; signal?: AbortSignal }

export async function run(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: !options.interactive,
      signal: options.signal,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    )
  })
}

export async function checked(command: string, args: string[], options: RunOptions): Promise<string> {
  const result = await run(command, args, options)

  if (result.code !== 0) throw new Error(result.stderr.trim() || `${command} ${args[0] ?? ''} exited ${result.code}`)

  return result.stdout
}
