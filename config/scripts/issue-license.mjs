#!/usr/bin/env node
// Issues offline license tokens for Orca.
//
//   node config/scripts/issue-license.mjs --genkey
//   node config/scripts/issue-license.mjs --licensee "Acme Corp" --days 365
//   node config/scripts/issue-license.mjs --licensee "Acme Corp" --days 365 --machine <fingerprint>
//
// The signing key is a secret and must never be committed. It is read from
// ORCA_LICENSE_PRIVATE_KEY, or from ~/.orca/license-signing-key.
//
// Token format matches src/shared/license-token.ts:
//   ORCA1.<base64url(payload JSON)>.<base64url(ed25519 detached signature)>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import nacl from 'tweetnacl'

const LICENSE_TOKEN_PREFIX = 'ORCA1'
const DAY_MS = 24 * 60 * 60 * 1000
const KEY_PATH = join(homedir(), '.orca', 'license-signing-key')

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function generateKeyPair() {
  if (existsSync(KEY_PATH)) {
    fail(
      `a signing key already exists at ${KEY_PATH}.\n` +
        'Generating a new one would invalidate every license already issued.\n' +
        'Move the existing key aside first if you really intend to rotate it.'
    )
  }
  const pair = nacl.sign.keyPair()
  mkdirSync(join(homedir(), '.orca'), { recursive: true })
  // Owner read/write only: this file can mint licenses for every customer.
  writeFileSync(KEY_PATH, `${base64url(pair.secretKey)}\n`, { encoding: 'utf8', mode: 0o600 })

  console.log(`Signing key written to ${KEY_PATH} (keep it secret, never commit it).`)
  console.log('\nPaste this public key into LICENSE_PUBLIC_KEY_B64 in')
  console.log('src/shared/license-token.ts, then rebuild:\n')
  console.log(`  ${base64url(pair.publicKey)}\n`)
  console.log('Licensing stays disabled until that constant is set.')
}

function loadSecretKey() {
  const fromEnv = process.env.ORCA_LICENSE_PRIVATE_KEY?.trim()
  const raw = fromEnv || (existsSync(KEY_PATH) ? readFileSync(KEY_PATH, 'utf8').trim() : '')
  if (!raw) {
    fail(
      `no signing key found.\nSet ORCA_LICENSE_PRIVATE_KEY or create ${KEY_PATH}.\n` +
        'Run with --genkey to create one.'
    )
  }
  const bytes = new Uint8Array(Buffer.from(raw, 'base64url'))
  if (bytes.byteLength !== nacl.sign.secretKeyLength) {
    fail(`signing key must be ${nacl.sign.secretKeyLength} bytes, got ${bytes.byteLength}`)
  }
  return bytes
}

function issue(args) {
  const licensee = typeof args.licensee === 'string' ? args.licensee.trim() : ''
  if (!licensee) {
    fail('--licensee is required (e.g. --licensee "Acme Corp")')
  }
  const days = Number(args.days)
  if (!Number.isInteger(days) || days <= 0) {
    fail('--days must be a positive whole number (e.g. --days 365)')
  }
  const machineId = typeof args.machine === 'string' ? args.machine.trim() : undefined
  const secretKey = loadSecretKey()

  const issuedAt = Date.now()
  const payload = {
    v: 1,
    id: randomUUID(),
    licensee,
    issuedAt,
    expiresAt: issuedAt + days * DAY_MS,
    ...(machineId ? { machineId } : {}),
    ...(typeof args.note === 'string' ? { note: args.note } : {})
  }

  const payloadSegment = base64url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = nacl.sign.detached(
    new TextEncoder().encode(`${LICENSE_TOKEN_PREFIX}.${payloadSegment}`),
    secretKey
  )
  const token = `${LICENSE_TOKEN_PREFIX}.${payloadSegment}.${base64url(signature)}`

  console.log(`Licensee:   ${licensee}`)
  console.log(`Expires:    ${new Date(payload.expiresAt).toISOString()} (${days} days)`)
  console.log(`Machine:    ${machineId ?? 'any (not bound)'}`)
  console.log(`License id: ${payload.id}`)
  if (!machineId) {
    // Say this out loud: an unbound token works on unlimited machines and
    // cannot be revoked before it expires.
    console.log(
      '\nNote: this license is not bound to a machine, so it works on any number of\n' +
        'computers and cannot be revoked before it expires. Pass --machine <fingerprint>\n' +
        "(from the customer's Settings screen) to bind it."
    )
  }
  console.log(`\n${token}\n`)
}

const args = parseArgs(process.argv.slice(2))
if (args.genkey) {
  generateKeyPair()
} else if (args.help) {
  console.log(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 11)
      .join('\n')
  )
} else {
  issue(args)
}
