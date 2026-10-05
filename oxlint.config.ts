import preset from '@st1ggy/linter-config/solid-ox'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [preset],
  options: { typeAware: true },
  ignorePatterns: ['dist/**', 'artifacts/**'],
  settings: {
    'import-x/core-modules': ['bun:test'],
    'import-x/resolver': {
      node: { extensions: ['.ts', '.tsx', '.js', '.json'] },
      typescript: { project: './tsconfig.json' },
    },
  },
  overrides: [
    {
      files: ['**/*.tsx'],
      rules: {
        // Oxfmt owns JSX layout; these inherited stylistic rules conflict with its wrapping.
        'stylistic-js/jsx-max-props-per-line': 'off',
        'stylistic-js/jsx-closing-bracket-location': 'off',
        'stylistic-js/jsx-closing-tag-location': 'off',
        'stylistic-js/jsx-curly-spacing': 'off',
        'stylistic-js/jsx-curly-newline': 'off',
        // Literal JSX text collapses spaces; terminal column labels need explicit string children.
        'stylistic-js/jsx-curly-brace-presence': 'off',
      },
    },
  ],
})
