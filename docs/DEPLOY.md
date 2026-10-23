# DealShield website - DEPLOY-READY note (N13)

Status: **deploy-ready, BLOCKED ON HOSTING.** The branch `kiko/review-fixes-20261023`
has the security headers in config, but nobody with access to the live host has applied
them yet. The live site still serves the old headers until this branch is deployed.

## Headers config in this repo
- `vercel.json` -> `headers`: CSP (with `frame-ancestors 'none'`, `connect-src 'self' https://api.dealshield.ng`),
  HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; noindex + no-store on app pages.
- `docs/nginx-security-headers.conf`: the same headers for an nginx host (include it in the HTTPS server block).
- `docs/SECURITY-HEADERS.md`: what each header does, the API base rule, SRI steps, and how to verify.
- Each page also has a meta CSP (the same as vercel.json minus `frame-ancestors`, which meta tags cannot set).

## Deploy order
1. Backend first (branch `kiko/otp-throttle-on-main-20261023`): migrations 013-016, then the app.
   This site depends on the backend's `ds_refresh` HttpOnly cookie (N16) and its credentialed CORS.
2. Then this website.

## Requirements for cookie refresh (N16)
- Same-origin is best: vercel.json rewrites `/auth/*` to the API, so the cookie is first-party.
- If pages call the API cross-origin, set `SAFEPAY_CORS_ORIGINS` on the backend to the exact site
  origins (for example `https://dealshield.com.ng,https://www.dealshield.com.ng`). Never use `*`.
- Keep `AUTH_REFRESH_BODY_COMPAT=true` until this website is live everywhere, then set it to false.

## After deploy, verify
- `curl -sI https://dealshield.com.ng/login.html`: CSP, HSTS, X-Frame-Options DENY, X-Robots-Tag noindex, Cache-Control no-store.
- Log in, then DevTools > Application: there is no `refresh_token` in localStorage, and the `ds_refresh` cookie is HttpOnly on `/auth`.
- Log out: the session disappears from Settings > Sessions.

## Blocker
Hosting access (Vercel project or the nginx server for dealshield.com.ng) is with Ibrahim.
Nothing here has been deployed.
