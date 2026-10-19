// SECURITY HEADERS: instructions the server sends with every reply, which the BROWSER obeys.
// They are a second wall: if a bug ever let an attacker slip a script into a page, the browser
// would still refuse to run it.
//
//   Content-Security-Policy   only scripts, styles, images and connections from THIS site;
//                             no inline scripts; no plug-ins; no being put inside another site's frame
//   X-Content-Type-Options    the browser must trust our file types and never guess a new one
//   Referrer-Policy           do not tell other sites which page the visitor came from
//   X-Frame-Options          older browsers' version of "no frames"
//   Permissions-Policy       only this site may use the camera (for scanning tickets); nothing else is allowed
//   Cross-Origin-Resource-Policy  other sites may not embed our files

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Resource-Policy": "same-origin",
});

// Use it like:  res.writeHead(200, { ...securityHeaders(), "Content-Type": "..." })
export function securityHeaders() {
  return { ...SECURITY_HEADERS };
}
