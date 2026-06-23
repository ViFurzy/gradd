#!/usr/bin/env node
/**
 * Release script — builds the Windows installers and publishes a GitHub release.
 * Requires: GH_TOKEN env var with repo write access.
 * Usage: npm run release
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { createInterface } from 'readline'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const version = pkg.version

// ── Prerequisites ──────────────────────────────────────────────────────────

if (!process.env.GH_TOKEN) {
  console.error('\nError: GH_TOKEN environment variable is not set.')
  console.error('Create a token at https://github.com/settings/tokens with "repo" scope,')
  console.error('then run:  $env:GH_TOKEN="ghp_..."  (PowerShell)\n')
  process.exit(1)
}

// ── Confirm ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout })
await new Promise((resolve) => {
  rl.question(`\nRelease Gradd v${version} to GitHub? [y/N] `, (answer) => {
    rl.close()
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }
    resolve()
  })
})

// ── Build + Publish ────────────────────────────────────────────────────────

function run(cmd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

try {
  run('npm run build')
  run('electron-builder --win --publish always')
  console.log(`\nDone. v${version} published to GitHub Releases.`)
} catch {
  console.error('\nRelease failed.')
  process.exit(1)
}
