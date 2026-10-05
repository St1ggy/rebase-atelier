import preset from '@st1ggy/linter-config/oxfmt-common'
import { defineConfig } from 'oxfmt'

export default defineConfig({
  ...preset,
  ignorePatterns: [...(preset.ignorePatterns ?? []), 'dist/**', 'artifacts/**', 'tests/fixtures/**'],
})
