# Releases

The npm package is `@st1ggy/rebase-editor`, and its executable is `rebase-editor`. The original unscoped npm package belongs to the inspiration project, [sjurba/rebase-editor](https://github.com/sjurba/rebase-editor).

## Distribution

The development manifest remains private. `scripts/package-release.ts` generates five public packages under `release/npm`: a small Node launcher and one optional native-binary dependency for each supported platform. Users do not need Bun, a compiler, postinstall scripts, or a GitHub download at installation time. npm installs the matching optional dependency.

Supported packages:

- `@st1ggy/rebase-editor`
- `@st1ggy/rebase-editor-darwin-arm64`
- `@st1ggy/rebase-editor-darwin-x64`
- `@st1ggy/rebase-editor-linux-x64`
- `@st1ggy/rebase-editor-win32-x64`

The generator copies the binaries, sets executable permissions, writes metadata and SHA-256 checksums, and creates npm tarballs. Native packages are published first, followed by the launcher. The publisher checks tarball integrity and skips versions only when the registry already contains the exact same tarball.

## First npm publication

npm requires a package to exist before configuring its trusted publisher. Bootstrap the five packages either with an authenticated local `npm login` session or with a granular publishing token in the GitHub repository secret `NPM_TOKEN`.

For a local bootstrap, download the exact `rebase-editor-release` workflow artifact and publish its verified tarballs:

```sh
gh run download RUN_ID --repo St1ggy/rebase-editor --name rebase-editor-release
npm run publish:release
```

Configure a trusted publisher for each of the five packages in npm package settings:

- GitHub user: `St1ggy`
- Repository: `rebase-editor`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`
- Environment: leave empty

The release job has `id-token: write` and uses npm 11.17.0. Subsequent releases use OIDC with automatic provenance; `NPM_TOKEN` is only a bootstrap fallback. Package permissions must explicitly allow direct publication, rather than only staged publication.

## Publish a version

Update `version` in the root `package.json`, regenerate `bun.lock` if needed, and commit the version change. The CLI and all generated packages derive their version from that manifest.

```sh
bun run check
bun run deps:release
bun run build:release
npm run package:release
NPM_PTY_SMOKE=1 npm run smoke:npm
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

Use the actual new version in the tag. The workflow rejects a mismatch between the tag and manifest version, gates builds on CI, tests installation and execution of the packed command on all four supported platforms, then publishes the exact tested tarballs. GitHub Release assets also contain the standalone binaries, checksums, and npm tarballs.

If npm authentication blocks the first publication, the verified GitHub binary release can still complete. Finish the bootstrap using the saved artifact, configure trusted publishers, and rerun the failed npm job. Do not rebuild or overwrite an npm version that is already published with different contents.
