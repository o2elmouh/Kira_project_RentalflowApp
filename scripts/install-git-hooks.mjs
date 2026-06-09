#!/usr/bin/env node
/**
 * Install RentaFlow git hooks by pointing `core.hooksPath` at
 * scripts/git-hooks. Runs automatically after `npm install` via the
 * package.json "prepare" script.
 *
 * Idempotent: re-running is a no-op if hooksPath is already correct.
 * Silent in CI / when there's no .git directory (e.g. `npm install` in a
 * fresh tarball, Vercel build context, etc.).
 */
import { execSync } from 'node:child_process'
import { existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const HOOKS_DIR = 'scripts/git-hooks'

try {
  if (!existsSync('.git')) {
    // Not a working git clone — nothing to do
    process.exit(0)
  }

  // Set hooksPath
  const current = execSync('git config --get core.hooksPath || true', { encoding: 'utf8' }).trim()
  if (current !== HOOKS_DIR) {
    execSync(`git config core.hooksPath ${HOOKS_DIR}`, { stdio: 'pipe' })
    console.log(`[graphify-hooks] core.hooksPath → ${HOOKS_DIR}`)
  }

  // Make hooks executable (Unix; on Windows Git uses shebang line)
  const hooks = ['post-commit']
  for (const h of hooks) {
    const p = join(HOOKS_DIR, h)
    if (existsSync(p)) {
      try { chmodSync(p, 0o755) } catch { /* Windows or restricted FS — ignore */ }
    }
  }
} catch (err) {
  // Never break `npm install` — hooks are an enhancement, not a requirement
  console.warn(`[graphify-hooks] install skipped: ${err.message}`)
  process.exit(0)
}
