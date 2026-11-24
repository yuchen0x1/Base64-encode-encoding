export const OBJECT_URL_REVOKE_DELAY_MS = 1000

export function revokeObjectURLAfter(url, delay = OBJECT_URL_REVOKE_DELAY_MS, revoke = URL.revokeObjectURL) {
  return setTimeout(() => revoke(url), delay)
}
