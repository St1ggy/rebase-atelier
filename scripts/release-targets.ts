export const npmName = '@st1ggy/rebase-editor'
export const repoUrl = 'https://github.com/St1ggy/rebase-editor'
export const releaseTargets = [
  { id: 'darwin-arm64', os: 'darwin', cpu: 'arm64', target: 'bun-darwin-arm64', asset: 'rebase-editor-darwin-arm64' },
  { id: 'darwin-x64', os: 'darwin', cpu: 'x64', target: 'bun-darwin-x64', asset: 'rebase-editor-darwin-x64' },
  { id: 'linux-x64', os: 'linux', cpu: 'x64', target: 'bun-linux-x64', asset: 'rebase-editor-linux-x64' },
  { id: 'win32-x64', os: 'win32', cpu: 'x64', target: 'bun-windows-x64', asset: 'rebase-editor-windows-x64.exe' },
] as const
