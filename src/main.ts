// Native VCS editors run with the repository's cwd, not Atelier's bunfig.toml.
// Install the transform before loading any application TSX in source mode.
if (!Bun.main.includes('$bunfs')) ensureSolidTransformPlugin()

await import('./cli')
import { ensureSolidTransformPlugin } from '@opentui/solid/bun-plugin'
