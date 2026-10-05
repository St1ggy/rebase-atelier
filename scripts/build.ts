import solidPlugin from '@opentui/solid/bun-plugin'

import { releaseTargets } from './release-targets'

const release = process.argv.includes('--release')

if (release) {
  for (const { target, asset } of releaseTargets) {
    const result = await Bun.build({
      entrypoints: ['src/main.ts'],
      plugins: [solidPlugin],
      target: 'bun',
      compile: {
        target,
        outfile: `artifacts/${asset}`,
        autoloadBunfig: false,
        autoloadDotenv: false,
      },
    })

    if (!result.success) throw new AggregateError(result.logs, `Build failed for ${target}`)
  }
} else {
  const result = await Bun.build({
    entrypoints: ['src/main.ts'],
    plugins: [solidPlugin],
    target: 'bun',
    outdir: 'dist',
    naming: 'rebase-atelier.js',
    external: ['@opentui/core'],
    sourcemap: 'linked',
  })

  if (!result.success) {
    throw new AggregateError(result.logs, 'Build failed')
  }
}
