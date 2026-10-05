import { testRender } from '@opentui/solid'

import { parsePlan } from '../src/domain/plan'
import { App } from '../src/ui/app'
import { resolveTheme } from '../src/ui/theme-context'
import { resolveViewMode } from '../src/ui/view-mode'

const width = Number(process.argv[2] ?? 120)
const height = Number(process.argv[3] ?? 30)

const setup = await testRender(
  () => (
    <App
      plan={parsePlan(
        'pick a4c92e1 Add authentication\nfixup 91de703 Fix token validation\nsquash c863b25 Add authentication tests\npick 74f081a Improve error messages\ndrop 09de662 Temporary logging\n',
        'git',
      )}
      title="feature/auth → main · Rebase Atelier"
      mode="demo"
      theme={resolveTheme(process.argv[4] ?? 'terminal')}
      icons={process.argv[5] ?? 'nerd'}
      view={resolveViewMode(process.argv[6])}
      onResult={(result) => {
        process.stdout.write(result.kind)
      }}
    />
  ),
  { width, height },
)

try {
  await setup.renderOnce()
  process.stdout.write(`${setup.captureCharFrame()}\n`)
} finally {
  setup.renderer.destroy()
}
