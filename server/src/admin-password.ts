import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const COST = 16_384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1

function deriveKey(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: cost, r: blockSize, p: parallelization }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt, COST, BLOCK_SIZE, PARALLELIZATION)
  return ['scrypt', COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, keyText] = encoded.split('$')
  if (algorithm !== 'scrypt' || !costText || !blockSizeText || !parallelizationText || !saltText || !keyText) return false

  const cost = Number(costText)
  const blockSize = Number(blockSizeText)
  const parallelization = Number(parallelizationText)
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false

  try {
    const expected = Buffer.from(keyText, 'base64url')
    if (expected.length !== KEY_LENGTH) return false
    const actual = await deriveKey(password, Buffer.from(saltText, 'base64url'), cost, blockSize, parallelization)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
