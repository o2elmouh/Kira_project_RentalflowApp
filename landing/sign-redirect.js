// Legacy contract-signing links predate the kiraflow.ma → app.kiraflow.ma
// split and look like kiraflow.ma/?sign=<token>. Forward them to the app
// with the query string intact. Loaded first thing in index.html <head>.
const APP_ORIGIN = 'https://app.kiraflow.ma'

export function getSignRedirectUrl(search) {
  const params = new URLSearchParams(search)
  const token = params.get('sign')
  if (!token) return null
  return `${APP_ORIGIN}/${search}`
}
