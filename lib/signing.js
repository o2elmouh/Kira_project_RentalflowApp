/**
 * RentaFlow — Sign-via-link utilities
 *
 * Tokens are stored in localStorage under key `rf_signing_tokens`.
 * Shape: { [token: string]: { contractId: string, createdAt: string, used: boolean } }
 *
 * Contract signatures are stored on the contract object itself via updateContract.
 */

import { getContracts, updateContract } from './db'

const STORAGE_KEY = 'rf_signing_tokens'

function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

/**
 * Generate a unique signing token tied to a contractId.
 * Returns the token string.
 */
export function createSigningToken(contractId) {
  const token = crypto.randomUUID()
  const tokens = loadTokens()
  tokens[token] = {
    contractId,
    createdAt: new Date().toISOString(),
    used: false,
  }
  saveTokens(tokens)
  return token
}

/**
 * Look up the contract object for a given token.
 * Returns { contract, tokenMeta } or null if token is invalid/used.
 */
export async function getContractForToken(token) {
  const tokens = loadTokens()
  const meta = tokens[token]
  if (!meta) return null
  if (meta.used) return { contract: null, tokenMeta: meta, error: 'used' }

  const contracts = await getContracts()
  const contract = contracts.find(c => c.id === meta.contractId) || null
  if (!contract) return { contract: null, tokenMeta: meta, error: 'not_found' }

  return { contract, tokenMeta: meta }
}

/**
 * Save the client's signature onto the contract and mark the token as used.
 */
export async function saveClientSignature(contractId, token, signatureDataUrl) {
  // Mark token used
  const tokens = loadTokens()
  if (tokens[token]) {
    tokens[token].used = true
    tokens[token].usedAt = new Date().toISOString()
    saveTokens(tokens)
  }

  // Update contract: attach signature + mark signed
  const contracts = await getContracts()
  const contract = contracts.find(c => c.id === contractId)
  if (!contract) throw new Error('Contract not found')

  await updateContract({
    ...contract,
    clientSignature: signatureDataUrl,
    signed: true,
    signedAt: new Date().toISOString(),
  })
}

/**
 * Build the full signing URL for a token.
 * Uses window.location.origin so it works in any deployment.
 */
export function getSigningUrl(token) {
  return `${window.location.origin}/?sign=${token}`
}
