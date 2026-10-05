import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { executeJjPlan, journalPath, readJournal } from '../../src/application/jj-rewrite'
import { parsePlan, setAction } from '../../src/domain/plan'
import { writePrivateJson } from '../../src/infrastructure/files'
import { checked, run } from '../../src/infrastructure/process'
import { gitAdapter } from '../../src/vcs/git'
import { jujutsuAdapter } from '../../src/vcs/jujutsu'
import { mercurialAdapter } from '../../src/vcs/mercurial'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true })
    await rm(journalPath(directory), { force: true })
  }
  directories.length = 0
})

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-native-'))

  directories.push(directory)

  return directory
}

test('Git history and native fixup rebase preserve the final tree', async () => {
  const cwd = await fixture()
  const git = (args: string[]) =>
    checked('git', ['-c', 'user.name=Atelier Test', '-c', 'user.email=test@example.invalid', ...args], { cwd })

  await git(['init', '-q'])

  for (const [name, contents] of [
    ['base', 'one'],
    ['feature', 'two'],
    ['fixup', 'three'],
  ]) {
    await writeFile(path.join(cwd, 'file.txt'), contents ?? '')
    await git(['add', 'file.txt'])
    await git(['commit', '-qm', name ?? ''])
  }

  const adapter = gitAdapter(cwd)
  const history = await adapter.history()
  const script = path.join(cwd, 'editor.mjs')

  await writeFile(
    script,
    String.raw`import fs from 'node:fs'; const p=process.argv.at(-1); const text=fs.readFileSync(p,'utf8'); const lines=text.split('\n'); let n=0; fs.writeFileSync(p,lines.map(l=>l.startsWith('pick ')&&++n===2?l.replace('pick ','fixup '):l).join('\n'));`,
  )
  expect(history.map((revision) => revision.subject)).toEqual(['fixup', 'feature', 'base'])
  expect(await adapter.inspect(history[0]?.id ?? '')).toContain('three')

  const command = adapter.start({ base: 'HEAD~2' }, [process.execPath, script])

  command.env.GIT_COMMITTER_NAME = 'Atelier Test'
  command.env.GIT_COMMITTER_EMAIL = 'test@example.invalid'
  const applied = await adapter.execute(command, false)

  if (applied.code !== 0) throw new Error(applied.stderr)

  expect(applied.code).toBe(0)
  expect(await readFile(path.join(cwd, 'file.txt'), 'utf8')).toBe('three')
  const finalHistory = await adapter.history()
  const finalSession = await adapter.session()

  expect(finalHistory.map((revision) => revision.subject)).toEqual(['feature', 'base'])
  expect(finalSession.state).toBe('idle')
})

test('Git conflict detection is filename-safe and abort restores the branch', async () => {
  const cwd = await fixture()
  const git = (args: string[]) =>
    checked('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.invalid', ...args], { cwd })

  await git(['init', '-q'])
  await writeFile(path.join(cwd, 'a space.txt'), 'base\n')
  await git(['add', '.'])
  await git(['commit', '-qm', 'base'])
  await git(['branch', 'destination'])
  await writeFile(path.join(cwd, 'a space.txt'), 'topic\n')
  await git(['commit', '-qam', 'topic'])
  const beforeOutput = await git(['rev-parse', 'HEAD'])
  const before = beforeOutput.trim()

  await git(['checkout', '-q', 'destination'])
  await writeFile(path.join(cwd, 'a space.txt'), 'destination\n')
  await git(['commit', '-qam', 'destination'])
  await git(['checkout', '-q', '-'])

  const adapter = gitAdapter(cwd)
  const command = adapter.start({ base: 'destination' }, ['true'])

  const applied = await adapter.execute(command, false)
  const conflicted = await adapter.session()
  const aborted = await adapter.execute(adapter.operation('abort', []), false)
  const after = await git(['rev-parse', 'HEAD'])

  expect(applied.code).not.toBe(0)
  expect(conflicted.files).toEqual(['a space.txt'])
  expect(aborted.code).toBe(0)
  expect(after.trim()).toBe(before)
})

test('Mercurial reads history and executes a native histedit roll plan', async () => {
  const cwd = await fixture()
  const executable = process.env.ATELIER_HG ?? 'hg'
  const hg = (args: string[]) =>
    checked(executable, ['--config', 'ui.username=Atelier <test@example.invalid>', ...args], { cwd })

  await hg(['init'])

  for (const [name, contents] of [
    ['base', 'one'],
    ['feature', 'two'],
    ['fixup', 'three'],
  ]) {
    await writeFile(path.join(cwd, 'file.txt'), contents ?? '')
    await hg(['add', 'file.txt'])
    await hg(['commit', '-m', name ?? ''])
  }

  const adapter = mercurialAdapter(cwd)
  const history = await adapter.history()
  const base = history[1]?.id ?? ''
  const plan = path.join(cwd, 'plan')

  expect(history.map((revision) => revision.subject)).toEqual(['fixup', 'feature', 'base'])
  await writeFile(plan, `pick ${base} feature\nroll ${history[0]?.id} fixup\n`)
  await hg(['--config', 'extensions.histedit=', 'histedit', '--commands', plan, base])
  const finalHistory = await adapter.history()
  const finalSession = await adapter.session()

  expect(finalHistory.map((revision) => revision.subject)).toEqual(['feature', 'base'])
  expect(await readFile(path.join(cwd, 'file.txt'), 'utf8')).toBe('three')
  expect(finalSession.state).toBe('idle')
})

function jjClient(cwd: string) {
  const executable = process.env.ATELIER_JJ ?? 'jj'

  return (args: string[]) =>
    checked(executable, ['--config', 'user.name="Atelier"', '--config', 'user.email="test@example.invalid"', ...args], {
      cwd,
    })
}

test('Jujutsu stable identities survive a reordered native plan', async () => {
  const cwd = await fixture()
  const jj = jjClient(cwd)

  await jj(['git', 'init'])
  await writeFile(path.join(cwd, 'one'), 'one')
  await jj(['describe', '-m', 'first'])
  await jj(['new'])
  await writeFile(path.join(cwd, 'two'), 'two')
  await jj(['describe', '-m', 'second'])

  const adapter = jujutsuAdapter(cwd)
  const history = await adapter.history()
  const first = history.find((revision) => revision.subject === 'first')
  const second = history.find((revision) => revision.subject === 'second')
  const base = first?.parents[0] ?? ''

  expect(first?.changeId).toBeTruthy()
  expect(second?.changeId).toBeTruthy()

  const plan = parsePlan(`pick ${second?.id} second\npick ${first?.id} first\n`, 'jj')
  const journal = await executeJjPlan(cwd, plan, base, [])

  expect(journal.completed).toBe(true)
  const after = await adapter.history()

  expect(after.find((revision) => revision.subject === 'first')?.changeId).toBe(first?.changeId)
  expect(after.find((revision) => revision.subject === 'first')?.parents).toContain(
    after.find((revision) => revision.subject === 'second')?.id ?? '',
  )
})

async function mergeScript(cwd: string): Promise<string[]> {
  const script = path.join(cwd, 'merge.mjs')

  await writeFile(
    script,
    "import fs from 'node:fs'; const a=process.argv; fs.copyFileSync(a[a.indexOf('--right')+1],a[a.indexOf('--output')+1]);",
  )

  return [process.execPath, script]
}

test('Mercurial rebase conflict resolves with the native merge protocol and continues', async () => {
  const cwd = await fixture()
  const executable = process.env.ATELIER_HG ?? 'hg'
  const argsPrefix = ['--config', 'ui.username=Atelier <test@example.invalid>', '--config', 'extensions.rebase=']
  const hg = (args: string[]) => checked(executable, [...argsPrefix, ...args], { cwd })

  await hg(['init'])
  await writeFile(path.join(cwd, 'file.txt'), 'base\n')
  await hg(['add', 'file.txt'])
  await hg(['commit', '-m', 'base'])
  await writeFile(path.join(cwd, 'file.txt'), 'incoming\n')
  await hg(['commit', '-m', 'incoming'])
  const source = await hg(['log', '-r', '.', '-T', '{node}'])

  await hg(['update', '-r', '0'])
  await writeFile(path.join(cwd, 'file.txt'), 'current\n')
  await hg(['commit', '-m', 'current'])
  const destination = await hg(['log', '-r', '.', '-T', '{node}'])
  const stopped = await run(executable, [...argsPrefix, 'rebase', '-s', source, '-d', destination], {
    cwd,
    env: { HGMERGE: 'internal:fail' },
  })
  const adapter = mercurialAdapter(cwd)
  const conflicted = await adapter.session()

  expect(stopped.code).not.toBe(0)

  if (conflicted.files.length === 0)
    throw new Error(`${stopped.stderr}\nResolve JSON: ${await hg(['resolve', '-l', '-T', 'json'])}`)

  expect(conflicted.files).toEqual(['file.txt'])

  const editor = await mergeScript(cwd)
  const resolved = await adapter.execute(adapter.resolve('file.txt', editor), false)

  if (resolved.code !== 0) throw new Error(resolved.stderr)

  expect(resolved.code).toBe(0)
  const continued = await adapter.execute(adapter.operation('continue', ['true']), false)

  if (continued.code !== 0) throw new Error(continued.stderr)

  expect(await readFile(path.join(cwd, 'file.txt'), 'utf8')).toBe('current\n')
  expect(continued.code).toBe(0)
})

test('Jujutsu native fixup and abandon preserve retained changes and journal completion', async () => {
  const cwd = await fixture()
  const jj = jjClient(cwd)

  await jj(['git', 'init'])
  await writeFile(path.join(cwd, 'one'), 'one')
  await jj(['describe', '-m', 'first'])
  await jj(['new'])
  await writeFile(path.join(cwd, 'two'), 'two')
  await jj(['describe', '-m', 'fix'])
  await jj(['new'])
  await writeFile(path.join(cwd, 'three'), 'three')
  await jj(['describe', '-m', 'temporary'])

  const adapter = jujutsuAdapter(cwd)
  const revisions = await adapter.history()
  const first = revisions.find((revision) => revision.subject === 'first')
  const fix = revisions.find((revision) => revision.subject === 'fix')
  const temporary = revisions.find((revision) => revision.subject === 'temporary')
  const initial = parsePlan(`pick ${first?.id} first\npick ${fix?.id} fix\npick ${temporary?.id} temporary\n`, 'jj')
  const folded = setAction(initial, new Set(['row-1']), 'fixup')
  const plan = setAction(folded, new Set(['row-2']), 'drop')
  const journal = await executeJjPlan(cwd, plan, first?.parents[0] ?? '', [])
  const after = await adapter.history()

  expect(journal.completed).toBe(true)
  expect(after.filter((revision) => !revision.immutable).map((revision) => revision.subject)).toEqual(['first'])
  expect(await readFile(path.join(cwd, 'two'), 'utf8')).toBe('two')
})

test('Jujutsu detects conflicts outside the working-copy change and resolves the chosen revision', async () => {
  const cwd = await fixture()
  const jj = jjClient(cwd)

  await jj(['git', 'init'])
  await writeFile(path.join(cwd, 'file.txt'), 'base\n')
  await jj(['describe', '-m', 'base'])
  const base = await jj(['log', '--no-graph', '-r', '@', '-T', 'commit_id'])

  await jj(['new', base, '-m', 'incoming'])
  await writeFile(path.join(cwd, 'file.txt'), 'incoming\n')
  const source = await jj(['log', '--no-graph', '-r', '@', '-T', 'change_id'])

  await jj(['new', base, '-m', 'current'])
  await writeFile(path.join(cwd, 'file.txt'), 'current\n')
  const destination = await jj(['log', '--no-graph', '-r', '@', '-T', 'commit_id'])

  await jj(['rebase', '-r', source, '--onto', destination])
  const adapter = jujutsuAdapter(cwd)
  const conflicted = await adapter.session()

  expect(conflicted.files.length).toBeGreaterThan(0)
  const editor = await mergeScript(cwd)
  const resolved = await adapter.execute(adapter.resolve(conflicted.files[0] ?? '', editor), false)

  if (resolved.code !== 0) throw new Error(resolved.stderr)

  const session = await adapter.session()

  if (session.files.length > 0)
    throw new Error(`${resolved.stdout}\n${resolved.stderr}\n${await jj(['resolve', '-l', '-r', source])}`)

  expect(session.files).toEqual([])
  expect(await jj(['file', 'show', '-r', source, 'file.txt'])).toBe('incoming\n')
})

test('Jujutsu resumes a failed message step and refuses an ambiguous in-flight operation', async () => {
  const cwd = await fixture()
  const external = await fixture()
  const jj = jjClient(cwd)

  await jj(['git', 'init'])
  await writeFile(path.join(cwd, 'one'), 'one')
  await jj(['describe', '-m', 'first'])
  await jj(['new'])
  await writeFile(path.join(cwd, 'two'), 'two')
  await jj(['describe', '-m', 'second'])

  const adapter = jujutsuAdapter(cwd)
  const before = await adapter.history()
  const first = before.find((revision) => revision.subject === 'first')
  const second = before.find((revision) => revision.subject === 'second')
  const initial = parsePlan(`pick ${first?.id} first\npick ${second?.id} second\n`, 'jj')
  const plan = setAction(initial, new Set(['row-0']), 'reword')
  const base = first?.parents[0] ?? ''
  const failedEditor = path.join(external, 'cancel.mjs')
  const goodEditor = path.join(external, 'message.mjs')

  await writeFile(failedEditor, 'process.exitCode = 1\n')
  await writeFile(
    goodEditor,
    String.raw`import fs from 'node:fs'; fs.writeFileSync(process.argv.at(-1),'rewritten\n');`,
  )
  await expect(executeJjPlan(cwd, plan, base, [process.execPath, failedEditor])).rejects.toThrow('plan stopped')
  const partial = await readJournal(cwd)

  expect(partial?.completed).toBe(false)
  expect(partial?.substep).toBe(1)
  const completed = await executeJjPlan(cwd, plan, base, [process.execPath, goodEditor], true)
  const after = await adapter.history()

  expect(completed.completed).toBe(true)
  expect(after.find((revision) => revision.changeId === first?.changeId)?.subject).toBe('rewritten')
  await writePrivateJson(journalPath(cwd), { ...completed, completed: false, inFlight: true })
  await expect(executeJjPlan(cwd, plan, base, [], true)).rejects.toThrow('ambiguous')
})
