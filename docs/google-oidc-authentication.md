# Google OIDC and approval actors

This prototype uses `openid-client` 6.8.8 for Google Authorization Code login and `iron-session` 9.0.1 for an encrypted and authenticated stateless session cookie. Node 24 supports both dependencies. Google tokens are used only during callback processing and are not persisted in the session, pending action, HTTP response, or application logs.

## HTTP behavior

| Route | Authentication | Behavior |
| --- | --- | --- |
| `GET /auth/google/login` | Public, explicit login | 302 to Google; 503 if authentication is unavailable |
| `GET /auth/google/callback` | Browser-bound, one-use OIDC flow | Verify code/ID token; create session; 302 to `/auth/me`; invalid flow 401 |
| `POST /auth/logout` | Public, idempotent | 204; clear the local application session cookie |
| `GET /auth/me` | Session | 200 principal; missing, invalid or expired session 401 |
| `POST /ai/device-assistant` | Public | Existing assistant behavior |
| `GET /ai/pending-actions/:id` | Public | Existing review behavior, including recorded decision actors |
| `POST /ai/pending-actions/:id/approve` | Session | 401 before action lookup without authentication; existing 200/400/404/409 behavior after authentication |
| `POST /ai/pending-actions/:id/reject` | Session | Same guard and existing decision semantics |

Protected APIs return 401 rather than redirecting. Login does not replay an approval or rejection. Decision request bodies remain empty; identity cannot be supplied in the request body.

Only `openid email profile` scopes are requested. The principal is `{ id, email?, displayName? }`: `id` is the verified Google `sub`, email is included only if `email_verified` is true, and display name comes from verified claims. Email is not an identity key or an authorization rule. The OIDC flow uses state, nonce and PKCE for correlation and protection, validates the token's issuer, audience and expiration, and verifies the ID token signature using Google's signing keys obtained through discovered provider metadata. The configured redirect URI is used for token exchange; callback Host headers do not determine it.

## Local setup and manual check

1. Create/select a Google Cloud project. In Google Auth Platform configure **Branding**, **Audience** (include test users when the application is in testing), and **Clients**. Create a **Web application** OAuth client.
2. Add the exact authorized redirect URI `http://localhost:3000/auth/google/callback`. Production must use the configured HTTPS callback. Download/copy the client ID and secret into local environment configuration; do not commit credentials.
3. Copy `.env.example` to `.env` if needed. Preserve the existing Gemini configuration and set:

   ```dotenv
   GOOGLE_OIDC_CLIENT_ID=<your web client ID>
   GOOGLE_OIDC_CLIENT_SECRET=<your web client secret>
   GOOGLE_OIDC_REDIRECT_URI=http://localhost:3000/auth/google/callback
   AUTH_SESSION_SECRET=<high entropy random secret of at least 32 characters>
   ```

   Generate a local secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Share the same session secret only among trusted instances of this application. Set `NODE_ENV=production` and HTTPS in production. If the port changes, update both Google and the environment redirect URI to match exactly.
4. Run `npm ci`, then `npm run start:dev`. Before login, `/auth/me` and POST decisions return 401. Visit `/auth/google/login` explicitly in a browser; after Google consent, `/auth/me` returns the verified principal.
5. Use `/docs` in that same browser/origin to review a pending action and explicitly approve/reject with an empty body. Browser cookies are sent automatically on same-origin Swagger requests; Swagger's cookie security declaration documents the requirement and is not a text-entry login mechanism. Generate a proposal through the existing assistant or review an already-created action. Approval returns `approvedBy` and ISO `approvedAt`; rejection returns `rejectedBy` and ISO `rejectedAt`.
6. Approve the same completed action as another logged-in user: the first actor/time and logical work order remain unchanged. Repeated rejection returns 409 and retains the original rejection record. No Google, Gemini or MCP call occurs during either decision.

A real Google login is a manual check requiring your Google project and credentials. Automated tests run without live Google or Gemini: a local signed-JWT OIDC provider exercises the real protocol library, while HTTP tests replace only the Google adapter and exercise the real session service and guards.

## Session, flow and ownership

`iot_session` is a host-only cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, two-hour Max-Age, and `Secure` when `NODE_ENV=production`. Its encrypted payload contains only principal and absolute expiration. The server checks expiration independently of the library's clock-skew allowance. Invalid seals and missing configuration fail closed. Configuration is lazy: importing the application and running unrelated tests/MCP does not need Google credentials. Cookie authentication is stateless; there is no server session store, server-side session revocation, refresh-token storage or automatic renewal in this phase.

`POST /auth/logout` returns 204 and clears only the local application session cookie, including for unauthenticated callers. It makes no Google call and does not revoke tokens or end the Google account/browser session, so a subsequent Google login may not require credential entry. The browser must apply the clearing cookie; a separately retained copy of the stateless cookie remains valid until expiration.

`iot_oidc_flow` is a random opaque browser handle with the same cookie protections and ten-minute lifetime. The process-local map holds state, nonce and PKCE verifier; callbacks consume the entry even on failure. Expired entries are discarded when starting login, with at most 1,000 pending flows. A restart loses pending login flows; multiple instances need sticky routing for login/callback. This intentionally small prototype does not implement distributed login-flow persistence.

The guard establishes a provider-neutral principal. The controller passes it to application approval/rejection orchestration; pending state copies the actor and records a Date only after the state check. Detached snapshots copy actor/date/result state. Work-order creation still owns its raw object, pending state clones that result, and the returned snapshot provides the detached approval result. Both stored and snapshot argument freezes remain; the whole action remains mutable inside its owning service. Duplicate approval keeps the original decision actor and date.

## Security boundaries and remaining gaps

SameSite=Lax supports the top-level Google GET callback and prevents ordinary cross-site POST requests from carrying the session cookie. This is the prototype's CSRF mitigation, not a complete CSRF defense: same-site subdomains, compromised same-origin content, and deployment details require separate evaluation. No CSRF token or Origin enforcement is added here. Production hardening should also address server-side session revocation, secure host/domain deployment, distributed workflow state, and actor authorization as separate stages. Authentication in this phase establishes actor identity only. Pending decisions now pass through the narrow OPA policy described in [architecture.md](architecture.md#pending-action-enforcement-phase-3); authentication alone does not grant the decision. No RBAC, email allowlist, tenant membership, or ownership policy is implemented.

Google configuration/token failures return generic errors without protocol details. Auth responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Application logging must not be configured to capture callback query strings or Cookie/Set-Cookie headers; this implementation does not log them. Actor records are visible through the existing public review endpoint by this phase's scope.

## Verification

```sh
npm run build
npm test
npm run ai:http:test
npm run ai:approval:http:test
npm run auth:http:test
npm run api:openapi:test
npm run lint
npm run mcp:test
git diff --check
```

Official references: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [openid-client](https://github.com/panva/openid-client), [iron-session](https://github.com/vvo/iron-session).
