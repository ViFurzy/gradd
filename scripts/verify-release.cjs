// Guards `npm run build:win` so a broken or stale release can't be published.
//   node scripts/verify-release.cjs --pre   refuse to build while Gradd runs from the output folder
//   node scripts/verify-release.cjs [dir]   check installer, update feed and packaged app (default: dist)
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const version = require('../package.json').version
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
const dir = path.resolve(__dirname, '..', arg || 'dist')

if (process.argv.includes('--pre')) {
  // A running Gradd (even one hidden in the tray) locks win-unpacked, and a running portable
  // ("Gradd 1.5.1.exe") locks its own file: either makes the build fail with EBUSY or hang.
  const ps = `Get-Process 'Gradd*' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${dir}*' } | Select-Object -First 1 -ExpandProperty Path`
  let running = ''
  try {
    running = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()
  } catch {
    // PowerShell unavailable: skip the check, electron-builder will still report EBUSY if it matters
  }
  if (running) {
    console.error(`Gradd is running from ${running}\nQuit it (also from the system tray) and build again.`)
    process.exit(1)
  }
  process.exit(0)
}

const problems = []
const need = (file) => {
  const p = path.join(dir, file)
  if (fs.existsSync(p)) return p
  problems.push(`missing ${file}`)
  return null
}

const setupName = `gradd-app-${version}-setup.exe`
const setup = need(setupName)
need(`${setupName}.blockmap`)
need(`Gradd ${version}.exe`)

// The update feed is what installed copies read to learn a new version exists.
const feed = need('latest.yml')
if (feed) {
  const text = fs.readFileSync(feed, 'utf8')
  // `size` only appears in the indented files entry; the others also exist at top level
  const field = (key) => ((text.match(new RegExp('^\\s*' + key + ': (.+)$', 'm')) || [])[1] || '').trim()
  if (field('version') !== version) problems.push(`latest.yml is for ${field('version')}, expected ${version}`)
  if (field('path') !== setupName) problems.push(`latest.yml points to ${field('path')}, expected ${setupName}`)
  if (setup) {
    const bytes = fs.readFileSync(setup)
    if (field('sha512') !== crypto.createHash('sha512').update(bytes).digest('base64'))
      problems.push('latest.yml sha512 does not match the installer')
    if (Number(field('size')) !== bytes.length) problems.push('latest.yml size does not match the installer')
  }
}

// The unpacked app (and so the installer built from it) must carry this version too.
const asar = path.join(dir, 'win-unpacked', 'resources', 'app.asar')
if (!fs.existsSync(asar)) {
  problems.push('missing win-unpacked/resources/app.asar')
} else {
  const packaged = JSON.parse(require('@electron/asar').extractFile(asar, 'package.json').toString())
  if (packaged.version !== version) problems.push(`packaged app is ${packaged.version}, expected ${version}`)
}

if (problems.length) {
  console.error(`Release ${version} in ${dir} is NOT consistent:\n - ${problems.join('\n - ')}`)
  process.exit(1)
}
console.log(`Release ${version} verified: installer, blockmap, portable, update feed and packaged app all match.`)
