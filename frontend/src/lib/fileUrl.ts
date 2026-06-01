/** Build a /api/files/* URL that carries the current access token as a query
 *  param. <img>, <a download>, etc. can't set Authorization headers, so the
 *  backend accepts ?access_token=… as a fallback for these routes. */
export function fileUrl(relPath: string): string {
  const tok = localStorage.getItem('auth.access_token') || ''
  const clean = relPath.replace(/^\/+/, '')
  return `/api/files/${clean}?access_token=${encodeURIComponent(tok)}`
}
