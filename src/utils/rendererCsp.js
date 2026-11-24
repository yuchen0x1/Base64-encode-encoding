const DEV_WEBSOCKET_SOURCES = [
  'ws://localhost:5173',
  'ws://127.0.0.1:5173'
]

export function productionConnectSource(source) {
  return String(source)
    .split(/\s+/)
    .filter(token => token && !DEV_WEBSOCKET_SOURCES.includes(token))
    .join(' ')
}

export function stripDevelopmentWebSockets(html) {
  return String(html).replace(
    /connect-src\s+([^;"]+)/,
    (_, source) => `connect-src ${productionConnectSource(source)}`
  )
}
