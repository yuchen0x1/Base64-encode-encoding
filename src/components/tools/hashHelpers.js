import CryptoJS from 'crypto-js'

const MATRIX_ROWS = [
  { id: 'MD5-SHORT', name: 'MD5 (16位中截取)' },
  { id: 'MD5', name: 'MD5 (32位完整摘要)' },
  { id: 'SHA1', name: 'SHA-1 (40位安全指纹)' },
  { id: 'SHA256', name: 'SHA-256 (64位密码级)' },
  { id: 'SHA512', name: 'SHA-512 (128位超强摘要)' },
  { id: 'HMAC-SHA256', name: 'HMAC-SHA256 (密钥签名)' }
]

const PRIMARY_ROW_BY_ALGORITHM = {
  MD5: 'MD5',
  SHA1: 'SHA1',
  SHA256: 'SHA256',
  SHA512: 'SHA512',
  'HMAC-SHA256': 'HMAC-SHA256'
}

function formatCase(value, letterCase) {
  return letterCase === 'upper' ? value.toUpperCase() : value.toLowerCase()
}

/**
 * Calculate the full digest matrix and identify the row used as the selected
 * algorithm's primary result. HMAC is deliberately calculated only when it is
 * selected, so other algorithms do not depend on a secret key.
 */
export function calculateHashResults({
  input = '',
  algorithm = 'MD5',
  letterCase = 'lower',
  secretKey = ''
} = {}) {
  const selectedAlgorithm = Object.hasOwn(PRIMARY_ROW_BY_ALGORITHM, algorithm)
    ? algorithm
    : 'MD5'
  const primaryRowId = PRIMARY_ROW_BY_ALGORITHM[selectedAlgorithm]

  if (!input) {
    const hashes = MATRIX_ROWS.map((row) => ({ ...row, val: '' }))
    return {
      hashes,
      primary: hashes.find((row) => row.id === primaryRowId),
      selectedAlgorithm
    }
  }

  const md5 = formatCase(CryptoJS.MD5(input).toString(), letterCase)
  const values = {
    'MD5-SHORT': md5.substring(8, 24),
    MD5: md5,
    SHA1: formatCase(CryptoJS.SHA1(input).toString(), letterCase),
    SHA256: formatCase(CryptoJS.SHA256(input).toString(), letterCase),
    SHA512: formatCase(CryptoJS.SHA512(input).toString(), letterCase),
    'HMAC-SHA256': selectedAlgorithm === 'HMAC-SHA256'
      ? formatCase(CryptoJS.HmacSHA256(input, secretKey).toString(), letterCase)
      : ''
  }
  const hashes = MATRIX_ROWS.map((row) => ({ ...row, val: values[row.id] }))

  return {
    hashes,
    primary: hashes.find((row) => row.id === primaryRowId),
    selectedAlgorithm
  }
}

export { PRIMARY_ROW_BY_ALGORITHM }
