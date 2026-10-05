// Bun's test runner deliberately does not load dotenv files automatically.
// Only local native-client overrides are read; CI supplies its own installed clients.
const file = Bun.file(new URL('../.env.local', import.meta.url))

if (await file.exists()) {
  const content = await file.text()

  for (const line of content.split('\n')) {
    const separator = line.indexOf('=')
    const name = line.slice(0, separator)

    if (['ATELIER_HG', 'ATELIER_JJ', 'ATELIER_ARC', 'ATELIER_GIT'].includes(name)) {
      process.env[name] ??= line.slice(separator + 1).trim()
    }
  }
}
