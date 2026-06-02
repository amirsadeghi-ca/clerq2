# Interpret — Project Reference

> **INSTRUCTION FOR CLAUDE:** After completing any task — no matter how small — update this file to reflect what changed. New files, deleted files, changed conventions, new endpoints, new node types, new environment variables, new gotchas, design decisions. Do this before marking the task done. This file is the single source of truth for the project; keeping it current is part of every task.

> **VERSIONING:** The app version lives in **`frontend/src/version.ts`** (`APP_VERSION` string). **Bump it on every commit that changes user-facing behaviour.** Use semver: `PATCH` for bug fixes / copy / style tweaks; `MINOR` for new features; `MAJOR` for breaking changes or full redesigns. The version is displayed in the left sidebar next to the Interpret wordmark. Current version: **3.3.1**.

> **REBRAND (Clerq2 → Interpret):** The product was renamed from **Clerq2** to **Interpret** in v2.0.0. Every user-facing string, the marketing site, the SQLite file (`clerq.db` → `interpret.db`, auto-migrated on startup by `api/entrypoint.sh`), the fake-email domain (`clerq.local` → `interpret.local`), Docker image/project names (`interpret-*`, via `name: interpret` in `docker-compose.yml`), and config/env defaults were updated. **Deliberately NOT renamed** (real infrastructure identities that would break things): the repo directory (`/Users/amirsadeghi/clerq2`, `/home/amix/clerq2`, `/srv/clerq2`), the GitHub remote (`amirsadeghi-ca/clerq2.git`), and the nas server-side files (`~/clerq2-autodeploy.sh`, `~/clerq2-deploy.log`, `~/clerq2-secrets-backup`, `/var/log/clerq2-deploy.log`). The production hostname references were switched to `interpret.genitechs.ca`; the old `clerq2.genitechs.ca` is still treated as production (sidebar/tab "dev" detection accepts both) so it keeps working as an alias until DNS is updated. A small **"dev" badge** now shows in the sidebar and a `[dev]` tab-title prefix appears on any non-production host.

> **REBUILD AFTER EVERY CHANGE:** After making any code change, always rebuild and restart the affected Docker services so the user sees the result immediately. For frontend changes: `docker compose build frontend && docker compose up -d --no-deps --force-recreate frontend`. For backend/API changes: `docker compose build api worker && docker compose up -d --no-deps --force-recreate api worker`. Never finish a task without confirming the running app reflects the change.

> **IMPLEMENTATION PLAN:** Active multi-phase work is tracked in [`docs/implementation-plan.md`](docs/implementation-plan.md). Read it before starting any new phase to understand what was approved, what's in scope, and the non-negotiable generalization principle.

Interpret is a document management platform. The core feature is a visual workflow editor (like n8n) where users design multi-step document processing pipelines, upload files, and run them via a background queue. The MVP workflow is: **Input → PDF to Images → Validate Documents → Output**.

The validation system has three parts: a **Document Library** (reusable document type definitions with AI instructions and sample images), **Policies** (named validation rule sets with a natural-language brief + optional structured rule cards with accept/fail criteria), and a **`validate_documents` workflow node** that calls OpenRouter vision models to check documents against a policy. Policies are versioned — every save (PUT /policies/{id}), rule add, rule delete, or reorder creates a new `PolicyVersion` snapshot. The version used in each run is recorded in the step's `output_data`.

The **Dashboard** is the end-user interface for running favorited workflows without entering the editor. Workflows can be starred (`is_favorite=true`) from the Workflows list page. Each favorited workflow appears as an interactive widget on the Dashboard — drop a PDF, click Run, and watch live step progress stream in. If the workflow has a `show_results` terminal node, a results sidebar slides in from the right when the run completes, rendering images, validation results, or raw JSON.

The **Mail section** (`/mail`) is both a real inbound/outbound email channel **and** an in-app test inbox. Each policy and workflow can have email receiving enabled (toggle in PolicyEditor / WorkflowList). Enabling assigns a dedicated address whose **local part defaults to a slug of the policy/workflow name** (e.g. `residential-mortgage@email.genitechs.ca`; a numbered suffix is appended on collision, falling back to `policy-{id}`/`workflow-{id}`). The **local part is fully editable** afterward — PolicyEditor has an inline address field, WorkflowList opens an inline editor from the mail icon — via `PUT …/inbox-address {local_part}`. The domain is fixed (`MAIL_INBOUND_DOMAIN`, default `email.genitechs.ca`) since it must be the Resend receiving domain. Helpers (slugify, validate, global uniqueness across policies+workflows) live in `api/app/mailboxes.py`; inbound resolution matches on the **stored** `email_address`, so any valid unique local part works. The `/mail` page's compose panel (From, To dropdown of active mailboxes, Subject, Body, file attachment) still exists for in-app testing — clicking Send uploads the file and calls `POST /api/mail/inbound` (tenant-scoped, UI fixture), which triggers the appropriate run.

**Real email is wired via Resend Inbound** (see the "Real email (Resend Inbound + replies)" section below): a real message sent to a mailbox address is parsed by Resend, which POSTs an `email.received` event to `POST /api/mail/resend-inbound`; that webhook downloads attachments, creates `Document`s, and fires the run with no logged-in user. When a run completes, `show_results.py` both writes an in-app reply `MailMessage` (shown in the inbox panel, polling every 5s) **and** sends a real reply email through Resend (with `Reply-To` set to the mailbox so replies loop back). Replies to a sender whose address ends in `@interpret.local` are kept in-app only (so UI-compose tests don't fire real mail).

The **Validate section** (`/validate`) is the policy-centric run launcher. It is the primary path for the common case — pick a policy, drop one or more documents, run, see results — without ever touching the workflow editor. Under the hood it fires the same canonical pipeline (input → pdf_to_images → validate_documents → show_results) and creates standard `WorkflowRun` records, but all of that is invisible to the user. The workflow editor remains available for advanced/custom pipelines. See the **Validate Section** design doc below.

The drop zone accepts multiple files. After dropping, the user sees a list of pending files — each row shows its filename with a remove button; an "Add more" button lets them append files without clearing the set. The Run button shows the file count when more than one is queued (`Run (N)`). Submitting uploads files sequentially, collects their document IDs, and fires a single run via `document_ids`. The run list shows a "N docs" badge for multi-document runs. Opening a completed multi-doc run's report and selecting a rule with per-document results shows a **Per document** section — each document's filename, status badge, individual evidence, and confidence — below the merged evidence text.

---

## Marketing / Public Website (`website/`)

Static, deploy-anywhere HTML/CSS/JS (Tailwind CDN + AOS, no build step) for the public-facing site, kept separate from the app so it can be uploaded to cPanel as-is. Two pages:

- **`website/index.html`** — the **Genitechs** company site. Genitechs is positioned as an *AI design, app & integration studio* serving public + private sector clients (services, products, four-step approach, why-us, sectors, FAQ, contact `info@genitechs.ca`). Features two products: **Interpret** (document intelligence) and **Vision** (structured-form scanning/capture — reads any form layout, extracts fields → structured data, handwriting/checkboxes/tables; cream "form sheet" mockups with an emerald scan beam + field-ring highlights; "early access", no dedicated page yet).
- **`website/interpret/index.html`** — the **Interpret** product landing page (copied from `landing/index.html`), re-branded "Interpret **by Genitechs**" with a back-link to `../index.html` and contact pointing to `info@genitechs.ca`.

**Brand colors (Genitechs page):** the org palette is **gold `#D4920A` / `#f0b429`** accent on **deep navy `#060e1a`** (cards `#0e1626`, borders `#1c2638`) — pulled from the live genitechs.ca CSS. Implemented by remapping Tailwind's `indigo-*` utility name to the gold ramp in `tailwind.config` (so all studio chrome turns gold with no per-element edits), plus `.btn-primary`/`.brand-grad`/`:root`/glows in the `<style>` block. Two product colors are kept distinct on top of gold: **Interpret = indigo** (its own `interpret-*` Tailwind color: logo, wordmark, pill, "Explore Interpret" button, why-us bar) and **Vision = emerald**. The **Interpret landing** (`website/interpret/`) keeps its original indigo `#6366f1` brand on dark `#0a0a0a`. Both pages share the same structure/animation system (Inter, grid-bg + glows, glassmorphic nav, light "paper" mockups, marquee, count-up stats, FAQ `<details>`). `landing/index.html` is the original standalone Interpret landing (kept; `website/interpret/` is the deployable copy). Preview locally via `.claude/launch.json` config `website` (python http.server on :4599) or any static server rooted at `website/`. For cPanel: upload the **contents of `website/`** to `public_html` — Genitechs at `/`, Interpret at `/interpret/`.

---

## Authentication & Tenancy

The app is **admin-provisioned multi-tenant**. There is no public signup. Every resource — workflows, policies, documents, runs, document types, reference lists, mail messages, app settings — is scoped to a **tenant**, and every API route filters by the logged-in user's tenant. Cross-tenant access is blocked at the query layer.

**Schema (in `api/app/models/auth.py`):**
- `tenants` — top-level isolation unit (`id, name, slug, is_active`).
- `users` — `(tenant_id, email)` unique; `role` in `owner|admin|member`; `mfa_required` flag.
- `auth_identities` — one row per (user, provider). `provider="password"` stores a bcrypt hash in `secret`; `provider="google"|"saml"|…` will store the provider's `subject` and be wired up later. Account-linking happens through this table.
- `refresh_tokens` — server-tracked, hashed-at-rest, revocable per row.
- `mfa_credentials` — enrolled second factors. `type="totp"` stores the Fernet-encrypted shared secret in `secret` (encrypted with a key derived from `SECRET_KEY` via SHA-256), bcrypt-hashed recovery codes in `recovery_codes_json`, `is_confirmed` flag, and `last_used_at`. Fully wired: enrollment, confirmation, login verification, and recovery-code consumption all work.

**Sessions (JWT access + refresh):**
- Access tokens are HS256 JWTs with `sub=user_id, tid=tenant_id, role, exp, iat, typ="access"`, 30 min by default (`ACCESS_TOKEN_MINUTES`).
- Refresh tokens are opaque random strings (server-stored as bcrypt hashes), 30 days by default (`REFRESH_TOKEN_DAYS`). `/auth/refresh` rotates them.
- Secret comes from `JWT_SECRET` if set, else falls back to `SECRET_KEY`.
- The frontend stores both in `localStorage` (keys `auth.access_token` / `auth.refresh_token`). The axios interceptor (`frontend/src/api/client.ts`) attaches the access token to every request and auto-refreshes once on 401 (coalesced across concurrent requests). Hard-logout + redirect to `/login` when refresh fails.

**Routes (`/api/auth/*`, see `api/app/routers/auth.py`):**
```
POST /api/auth/login            {email, password, mfa_code?} → {access_token, refresh_token, expires_at}
POST /api/auth/refresh          {refresh_token}              → new pair (rotates)
POST /api/auth/logout           {refresh_token}              → 204 (best-effort revoke)
POST /api/auth/logout-all                                    → 204 (revokes every refresh token for the user)
GET  /api/auth/me                                            → {user, tenant}
PATCH /api/auth/me              {display_name?}              → self-service profile update
POST /api/auth/change-password  {current_password, new_password}
POST /api/auth/forgot-password  {email} → 200 always (no email-existence leak); sends Resend email with reset link (stub-logs in dev)
POST /api/auth/reset-password/validate  {token} → {valid, email}  — prefill the form
POST /api/auth/reset-password  {token, new_password} → 204; marks token used, revokes all sessions

GET    /api/auth/mfa                                            → MfaMethod[]   list confirmed MFA methods for current user
POST   /api/auth/mfa/totp/enroll                               → {credential_id, provisioning_uri, secret}   start TOTP enrollment; cleans up stale pending enrollments
POST   /api/auth/mfa/totp/confirm     {credential_id, code}    → {recovery_codes: [10]}   confirm with TOTP code; activates MFA; shows recovery codes ONCE
DELETE /api/auth/mfa/{credential_id}  {current_password? or totp_code?} → 204   remove MFA method; clears mfa_required if no methods remain
POST   /api/auth/mfa/recovery-codes/regenerate  {totp_code}   → {recovery_codes: [10]}   replace recovery codes after confirming with live TOTP code
```

**Dependency `get_current_user`** (in `api/app/security.py`) extracts `Authorization: Bearer <jwt>`. Routes that can't set headers (SSE `/api/runs/{id}/stream`, `/api/files/{path}`) also accept `?access_token=…` — the frontend uses `lib/fileUrl.ts` to build those URLs and the SSE consumers pass it explicitly. Every router takes `tenant_id: int = Depends(get_current_tenant_id)` and filters its queries by it. The `files` router additionally resolves the requested storage path back to a Document / DocumentTypeSample / WorkflowRun and verifies it belongs to the caller's tenant before serving the bytes.

**Admin CLI (`docker compose exec api python -m app.cli …`):**
```
list-tenants
create-tenant "Acme Inc"  [--slug acme]
list-users [--tenant acme]
create-user --tenant acme --email amir@acme.co --password 'first' [--role owner|admin|member]
set-password --email amir@acme.co --password 'new'
deactivate-user --email amir@acme.co
```
`create-user` auto-creates the matching `auth_identities(provider="password")` row. The migration seeds **`admin@interpret.local`** in the **Default** tenant with NO usable password — set one before first login via `set-password`. Passwords use bcrypt directly (`app/security.py`); pre-truncated to 72 bytes for bcrypt 4.x compatibility (passlib has a known incompat with bcrypt ≥ 4 that we work around by not using passlib).

**Frontend:**
- `frontend/src/context/auth.tsx` — `AuthProvider` + `useAuth()` (user/tenant/loading + login/logout/refresh). Bootstraps from `localStorage` and calls `/auth/me` on first mount.
- `frontend/src/pages/LoginPage.tsx` — at `/login`, MFA-field-ready (only shown if the API replies "MFA code required").
- `frontend/src/components/ProtectedRoute.tsx` — wraps every app route in `App.tsx`; redirects to `/login` (preserving the intended path) when unauthenticated.
- **Settings page is sectioned**, with nested routes under `/settings/{section}`. Layout in `frontend/src/pages/settings/SettingsLayout.tsx` (left sub-nav + content via `<Outlet>`). Sections: `AccountSection` (profile + change password + sign-out everywhere), `AppearanceSection` (theme), `LanguageSection` (UI language), `AiSection` (OpenRouter). To add a section: drop a `XxxSection.tsx` under `pages/settings/`, add a row to the `SECTIONS` array in `SettingsLayout`, and a nested `<Route>` in `App.tsx`. `useAuth()` exposes a `refetchMe()` helper so account-edit forms can refresh the cached user state after a PATCH.
- Sign-out lives in the bottom of `LeftSidebar.tsx` with the user's display name + tenant name.
- All bilingual strings in `frontend/src/lib/i18n/strings/auth.ts` (Quebec FR uses "Courriel", "Code de l'authentificateur", etc.).
- **Forgot password flow:** `LoginPage` has "Forgot password?" link next to the password label → `ForgotPasswordPage` (`/forgot-password`) sends reset link via email; always shows success (no email-existence leak). `ResetPasswordPage` (`/reset-password/:token`) validates the token on load (shows "expired" state if invalid), prefills the email in the subtitle, and on success shows a green confirmation with "Sign in" button. Both pages are public (no `ProtectedRoute`). Backend: `PasswordResetToken` model + Alembic migration `0005_password_reset_tokens`, 3 new endpoints in `auth.py`. Token is a 32-byte random URL-safe string, bcrypt-hashed at rest, 1-hour TTL (`PASSWORD_RESET_EXPIRY_HOURS`), single-use, one active at a time per user.
- **MFA management UI** in `AccountSection.tsx` (Settings → Account): shows the enrolled authenticator app with green shield badge + last-used date when active; "Set up authenticator app" button when inactive. Setup is a 3-step modal: (1) QR code (`react-qr-code` SVG) + manual-entry key, (2) 6-digit TOTP verification, (3) 10 one-time recovery codes shown once. "Remove" opens a confirmation modal requiring current password OR a TOTP code. "Regenerate recovery codes" requires a live TOTP code and shows the new set once.
- API hooks in `frontend/src/api/mfa.ts`.

**Super-admin role + admin UI.** `users.is_superadmin` (boolean, default false) unlocks cross-tenant management. Super-admins still belong to a tenant for their own day-to-day work; the flag just gates `/api/admin/*`. The seed super-admin is **amir@sadeghi.me** (set up in migration `0003_superadmin.py`) in the Default tenant. Endpoints (all guarded by `require_superadmin`):
```
GET    /api/admin/tenants                              → AdminTenant[]   (with user_count)
POST   /api/admin/tenants                              → AdminTenant     {name, slug?}
GET    /api/admin/tenants/{id}                         → AdminTenant
PUT    /api/admin/tenants/{id}                         → AdminTenant     {name?, slug?, is_active?}
GET    /api/admin/tenants/{id}/users                   → AdminUser[]
POST   /api/admin/tenants/{id}/users                   → AdminUser       {email, password, display_name?, role?, is_superadmin?}
GET    /api/admin/users/{id}                           → AdminUser
PUT    /api/admin/users/{id}                           → AdminUser       {display_name?, role?, is_active?, is_superadmin?, mfa_required?}
POST   /api/admin/users/{id}/set-password              → AdminUser       {new_password}  (revokes all sessions)
GET    /api/admin/integrations                         → Integrations    app-wide integration config (secrets returned as *_set booleans only)
PUT    /api/admin/integrations                         → Integrations    {resend_api_key?, resend_inbound_webhook_secret?, mail_inbound_domain?, invite_from_address?, invite_from_name?, clear_*?} — a secret is updated only when a non-empty value is sent (blank save keeps it); clear_* wipes it
POST   /api/admin/integrations/email/test              → {ok, error?}    sends a test email to the calling super-admin via Resend
```
The frontend has a full **`/admin`** page (`frontend/src/pages/AdminPage.tsx`) with a top-bar **view switcher: "Tenants & users" | "Integrations"**. The tenants view: left column lists tenants with user counts; right column shows the selected tenant's users in a table with role/status/sign-in columns and per-row "Set password" + "Edit" actions; modals for creating tenants and users, editing tenants and users (active flag, role, MFA-required, super-admin flag), and setting passwords. The **Integrations view** (`frontend/src/components/IntegrationsPanel.tsx`, hooks in `frontend/src/api/integrations.ts`, strings in `strings/integrations.ts`) is an Email (Resend) card: Resend API key, From address/name, inbound domain, and **inbound webhook secret** — plus read-only copy rows for the webhook URL (`{APP_BASE_URL}/api/mail/resend-inbound`) and the inbound MX record to add in DNS, and a "Send test email" button. The nav link "Administration" only appears in `LeftSidebar.tsx` for users where `user.is_superadmin === true` (visible via `/auth/me`). The page also renders a "super-admin only" empty state if a non-superadmin loads `/admin` directly. Strings live in `frontend/src/lib/i18n/strings/admin.ts` (en + fr-CA).

**App-wide settings (`app/system_settings.py`).** The Resend/email integration config is stored in `app_settings` under the reserved **`tenant_id=0`** row (the model already documented this reservation). `system_settings.py` exposes `get_system`/`set_system` plus typed resolvers (`resend_api_key`, `resend_inbound_webhook_secret`, `mail_inbound_domain`, `invite_from_address`, `invite_from_name`) that read DB-first and **fall back to the env var** (`app.config.settings`) — so env-only deploys keep working until an admin overrides a value in the Integrations UI. `mailer.py` (send key + from), the `/api/mail/resend-inbound` webhook (verify secret + attachment-fetch key), and the policy/workflow `enable-inbox` endpoints (inbound domain) all read through these resolvers. Resolvers accept an optional `Session`; the mailer omits it and opens a short-lived one (it's often called without a request db). **`tenant_id=0` is a sentinel, not a real tenant — never expose these to non-super-admins.**

**Permission system (RBAC, per-tenant, code-defined).** Permission keys are namespaced strings declared in `api/app/permissions.py` (`Permission.TENANT_USERS_INVITE`, `Permission.TENANT_USERS_REMOVE`, etc.). The `(role → set of permission keys)` mapping is stored **per tenant** in `tenant_role_permissions(tenant_id, role, permission_key)` so each tenant can later customize. Defaults from `DEFAULT_ROLE_PERMISSIONS` are seeded on tenant creation (see `seed_default_role_permissions()` called from the admin tenant-create endpoint and the alembic seed loop). Today: **owner** = everything, **admin** = invite/remove/update_role/set_password/read users, **member** = nothing. Super-admins (`User.is_superadmin`) bypass these checks. Authority rule beyond permission keys (in `can_act_on_target_role()`): a tenant `admin` cannot invite, remove, change role of, or reset password of another `admin`/`owner` — only `owner`s (and super-admins) can.

**Adding a permission — full checklist (do ALL of these or the permission is incomplete):**
1. Add `Permission.X = "x.y.z"` in `app/permissions.py` (namespaced: `tenant.resource.action`).
2. Add an entry to `ALL_PERMISSIONS` (key, label, category) — this drives the UI permission editor.
3. Add it to `DEFAULT_ROLE_PERMISSIONS` for the appropriate roles (owner always gets everything; choose whether admin/member should get it by default).
4. Write a new Alembic migration (`api/alembic/versions/00NN_…py`) that seeds the `(tenant_id, role, key)` rows into every existing tenant. Use the idempotent pattern (check before insert).
5. Gate the endpoint with `Depends(require_permission(Permission.X))` or a manual `get_permissions_for` check.
6. Enforce the authority rule via `can_act_on_target_role(actor, target.role)` where applicable — permission keys alone don't prevent an admin from acting on another admin/owner.

**Current permissions (`tenant.users.*`):**
- `tenant.users.read` — view the user list
- `tenant.users.invite` — send invite links
- `tenant.users.remove` — deactivate a user (`is_active=false`, reversible)
- `tenant.users.delete` — permanently hard-delete a user (irreversible; added migration 0006)
- `tenant.users.update_role` — change a user's role
- `tenant.users.set_password` — admin-set a user's password

**Delete vs Remove:** `remove` = soft deactivate (reversible, keeps the row). `delete` = hard delete (permanent — removes user, identities, MFA credentials, refresh tokens, password-reset tokens). Both respect `can_act_on_target_role`; delete also guards: cannot delete yourself, cannot delete the last owner of a tenant.

**Tenant-scoped self-administration (`/api/tenant/*`).** Endpoints for tenant owners/admins to manage their own tenant without super-admin. Gated by `require_permission(...)`; always implicitly scoped to the caller's home tenant. Super-admins also pass these checks (the permissions helper returns all keys for them).
```
GET    /api/tenant                                   → {tenant, my_permissions[]}
GET    /api/tenant/permissions                       → ALL_PERMISSIONS registry (for UI)
GET    /api/tenant/role-permissions                  → role → [permission_key]
PUT    /api/tenant/role-permissions/{role}           → replace permission set for role
                                                       (requires tenant.permissions.manage; owner role can never lose tenant.permissions.manage)
GET    /api/tenant/users                             → list users (tenant.users.read)
PUT    /api/tenant/users/{id}                        → update display_name / role / is_active / mfa_required
                                                       (per-field permission keys; respects authority rule)
POST   /api/tenant/users/{id}/set-password           → admin-set password
POST   /api/tenant/invites                           → invite user (tenant.users.invite)
GET    /api/tenant/invites                           → list pending invites
POST   /api/tenant/invites/{id}/revoke               → revoke
POST   /api/tenant/invites/{id}/resend               → rotate token + resend email
```

**Invite flow.** `user_invites` table (token_hash, expires_at, accepted_at, revoked_at). On `POST /api/tenant/invites`, server generates a 32-byte URL-safe token, stores its bcrypt hash, sends an email containing `{APP_BASE_URL}/invite/{raw_token}`, and returns the URL in the response (so the admin UI can show a "copy link" affordance — independent of email delivery). Public endpoints (no auth) live at `/api/invites/*`:
```
POST /api/invites/lookup   {token} → {valid, email, tenant_name, role}
POST /api/invites/accept   {token, password, display_name?} → TokenPair (auto signed-in)
```
Invites are single-use (`accepted_at` set on consumption) and admin-revocable. Resend rotates the token and clears `revoked_at`. Frontend public page is `frontend/src/pages/InviteAcceptPage.tsx` at `/invite/:token` — after accept, `setTokens(...)` + `window.location.replace('/')` (a full reload so `AuthProvider` re-bootstraps from the new tokens; an SPA `navigate('/')` keeps the old null-`user` state and ProtectedRoute kicks back to `/login`).

**`APP_BASE_URL` per environment.** The invite email/link is built as `{APP_BASE_URL}/invite/{token}`. The root `docker-compose.yml` doesn't set it (the api falls back to `http://localhost` from `Settings`), and dev `.env` typically pins `APP_BASE_URL=http://localhost`. The **prod overlay** `deploy/docker-compose.prod.yml` overrides it on the api container to `https://interpret.genitechs.ca` so production invites carry public URLs. Anywhere a new public hostname is introduced, update both the Cloudflare Tunnel ingress in `deploy/cloudflared/config.yml` and `APP_BASE_URL` in the overlay.

**Email delivery — Resend.** `app/mailer.py` exposes one function `send_email(to, subject, html, text?)` that always returns a `SendResult` (never raises). When `RESEND_API_KEY` is set it POSTs to `https://api.resend.com/emails` with `{from: "{INVITE_FROM_NAME} <{INVITE_FROM_ADDRESS}>", to, subject, html, text?}`. Without `RESEND_API_KEY` it logs the body to stdout. Sender domain `email.genitechs.ca` is verified in Resend; the default `INVITE_FROM_ADDRESS=noreply@email.genitechs.ca` works for any recipient. (Resend's free `onboarding@resend.dev` sender will only deliver to the Resend account owner's verified address — fine for stub-mode, not for real invites.)

**Admin UI updates (`frontend/src/pages/AdminPage.tsx`).** Toolbar gained an **Invite user** button (visible when the super-admin is viewing their own tenant); clicking sends the invite and shows the resulting URL in a "copy link" field inside the same modal so the admin can share it directly when needed. A **Pending invitations** section above the user table lists unaccepted invites with copy / resend / revoke icons. The Copy button reissues the invite via `/resend` first (the raw token is hashed and gone after creation, so the only way to fetch a fresh URL is to rotate). Hooks live in `frontend/src/api/tenant.ts`; strings in `frontend/src/lib/i18n/strings/admin.ts` (en+fr).

**Forward extensibility (foundation laid, not yet wired):**
- SSO/Google/SAML — drop a new identity provider row with `provider="google"` and a `subject` (Google `sub` claim). Add `/auth/sso/google/start` + `/auth/sso/google/callback` routes. Account-linking comes for free because a user can have multiple identities.
- TOTP MFA — when a user enrolls, create an `mfa_credentials(type="totp")` row with the (encrypted) shared secret + 10 bcrypt-hashed recovery codes. Flip `users.mfa_required=true`. The login endpoint already rejects when `mfa_required && !mfa_code` — fill in the verification call.
- Per-tenant invite flow — when public-signup is wanted, add an `invites` table with a one-time token; clicking it triggers `create-user` server-side.

---

## Database Migrations (Alembic)

The schema is now managed by **Alembic**. Never call `Base.metadata.create_all()` in production code, never hand-edit the live SQLite, and never add a `try/except ALTER TABLE` shim back into the codebase. Every schema change goes through a numbered revision in `api/alembic/versions/`.

**Where things live:**
- `api/alembic.ini`, `api/alembic/env.py`, `api/alembic/script.py.mako` — Alembic config (env reads `database_url` from `app.config.settings` and uses SQLite-safe `render_as_batch=True`).
- `api/alembic/versions/0001_baseline.py` — captures the schema as it existed before Alembic was introduced (so fresh installs build the whole tree).
- `api/alembic/versions/0002_auth_and_tenancy.py` — adds the auth tables, seeds the Default tenant + bootstrap admin user, adds `tenant_id` to every resource table, backfills, makes it `NOT NULL`, and rebuilds `app_settings` with the composite PK `(tenant_id, key)`.
- `api/app/migrations.py` — `run_migrations()` stamps the baseline on pre-Alembic DBs (so live data survives) and runs `alembic upgrade head`.
- `api/app/migrate_cli.py` + `api/entrypoint.sh` — the container entrypoint runs migrations **once** before exec'ing uvicorn/celery. Migrations no longer run from FastAPI's startup hook — uvicorn `--reload` was triggering re-entrant migration runs against SQLite, which deadlocked. The api becomes healthy only after migrations finish, and the worker waits on api-healthy.

**Day-to-day workflow:**
1. Edit the SQLAlchemy models.
2. Generate a revision:
   ```bash
   docker compose exec api alembic revision --autogenerate -m "what changed"
   ```
   Review the file under `api/alembic/versions/` — `--autogenerate` doesn't catch everything (constraint changes, server defaults, sometimes nullability). Hand-edit as needed.
3. Apply locally:
   ```bash
   docker compose restart api   # entrypoint runs `alembic upgrade head`
   ```
   Or manually: `docker compose exec api alembic upgrade head`.
4. Commit the revision file. **Merge-to-`main` → the nas auto-deploy cron rebuilds the api image → the entrypoint runs `alembic upgrade head` against the production DB.** No human step required on the server.

**SQLite-specific rules:**
- Use `op.batch_alter_table(...)` for anything that isn't a plain `ADD COLUMN` — SQLite can't actually alter most columns in place, batch mode does a table-rebuild dance for you.
- **Every constraint inside a batch block must be named** (`op.f("…")` or an explicit string). Unnamed `sa.ForeignKey("x.id")` in a batch context raises `ValueError: Constraint must have a name`. The migration `0002_auth_and_tenancy.py` adds the `tenant_id` FK as `fk_<table>_tenant_id`.
- Backfills run via `bind = op.get_bind(); bind.execute(sa.text("UPDATE … SET tenant_id = :tid"), {...})`.

**The pre-Alembic stamp dance.** On `nas` (and on dev machines that ran the app before this branch) the DB was built by `Base.metadata.create_all()` plus `ALTER TABLE ADD COLUMN` calls. `run_migrations()` detects this by looking for `workflows` existing while `alembic_version` is absent; if so it `command.stamp(cfg, "0001_baseline")` first so the baseline isn't re-applied as DDL against an already-populated DB, then runs `upgrade head`. After the first deploy the stamp branch is a no-op.

**Don't:**
- Don't `Base.metadata.create_all()` in any startup code path — only the migration runs in production.
- Don't put long-running DDL behind uvicorn's `--reload` — see above. Container entrypoint is the place.
- Don't skip naming a constraint in batch mode.
- Don't downgrade a production migration — write a new forward-only revision that compensates.

---

## Running the App

```bash
cp .env.example .env          # first time only
docker compose up -d          # start all services
docker compose logs -f        # tail all logs
docker compose logs -f worker # tail just the worker
```

To rebuild after code changes to `api/` or `frontend/`:

```bash
docker compose build api worker frontend
docker compose up -d --force-recreate
```

The API source (`api/app/`) is mounted as a volume — uvicorn auto-reloads Python changes without a rebuild. Frontend changes require a rebuild.

**URLs:**
- App: http://localhost (nginx on port 80)
- API: http://localhost:8000 (also proxied through nginx at `/api`)
- Health check: http://localhost:8000/api/health

---

## Production Deployment (live: https://interpret.genitechs.ca)

The app is deployed on the home server **`nas`** (`192.168.2.63`, user `amix`, ssh alias `nas`; sudo password is kept in private deployment notes — **never commit it to this repo**) and exposed publicly through a **named Cloudflare Tunnel** at **`interpret.genitechs.ca`**. The rest of the `genitechs.ca` zone (root site, MX/email) is intentionally untouched — only a single `interpret` CNAME was added, and Cloudflare Email Routing is **not** enabled.

**Topology:** `browser → https://interpret.genitechs.ca → cloudflared (container) → frontend:80 → api:8000 → worker → OpenRouter`. No host ports are published in prod; the only ingress is the tunnel.

**What's on nas:**
- Docker Engine + compose plugin, daemon enabled (survives reboot); `amix` in the `docker` group.
- App source at `~/clerq2` (delivered by `rsync` from the dev Mac — the local repo has **no git remote**, so deploys are rsync-based, not git-pull).
- `cloudflared` binary installed on the host (used only for `tunnel login`/`create`/`route dns`); the running tunnel is a **container**.
- Tunnel **`interpret`** = id `6beceb78-d6e6-4047-bb55-551933a3e21d` (locally-managed: ingress in git, credentials mounted).

**Files (created on nas, not all in git):**
- `~/clerq2/.env` — `SECRET_KEY` (generated), `OPENROUTER_API_KEY=` **empty** (set it in the app's Settings, or runs with a `validate_documents` node fail), `OPENROUTER_DEFAULT_MODEL`, DB/redis/storage paths.
- `deploy/cloudflared/config.yml` — `tunnel:` UUID + ingress `interpret.genitechs.ca → http://frontend:80` (connectTimeout 30s) + catch-all 404.
- `deploy/cloudflared/credentials.json` — tunnel secret (gitignored).
- `deploy/docker-compose.prod.yml` — overlay: strips host ports on `api`/`frontend`, adds the **locally-managed** `cloudflared` service (mounts `config.yml` + `credentials.json`).

**Bring up / redeploy on nas:**
```bash
cd ~/clerq2
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```
**Source sync — local ↔ GitHub ↔ server, one repo `git@github.com:amirsadeghi-ca/clerq2.git`:** three checkouts track `main` — local Mac at `/Users/amirsadeghi/clerq2`, GitHub, and nas at `/home/amix/clerq2`. **The server auto-deploys.** A cron job on nas polls `origin/main` every 2 minutes; on a new commit it runs `~/clerq2-autodeploy.sh` (a wrapper that lives OUTSIDE the repo), which invokes `bash deploy/deploy.sh`. That script does `git reset --hard origin/main` → `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml build` → `up -d --force-recreate`. Output goes to `~/clerq2-deploy.log`. **New workflow:** edit locally → `git push` → the server picks it up within ~2 min. No manual `git pull` / recompose on nas. **Why the wrapper is external + why `deploy/*.sh` are mode 100755 in git:** `deploy.sh`'s `git reset --hard` would otherwise strip the +x bit off any in-repo script on every deploy. So (a) the wrapper lives outside the repo and is invoked as `bash deploy/deploy.sh` (NOT `./deploy/deploy.sh`), and (b) `deploy/deploy.sh` and `deploy/cron-poller.sh` are committed with mode 100755 (set via `git update-index --chmod=+x`) so `reset --hard` restores the +x. Any future in-repo deploy script must do the same. The first auto-deploy applied the prod overlay for real — host ports on `api` and `frontend` are stripped, and the Cloudflare tunnel is the only ingress (the documented prod state). nas still authenticates to GitHub with a **read-only deploy key** at `~/.ssh/id_ed25519` (registered under the repo's Deploy keys). `.env`, `data/`, and `deploy/cloudflared/{config.yml,credentials.json}` remain **gitignored**, live only on the server, and are preserved across deploys (a backup sits in `~/clerq2-secrets-backup/`). The **memory files include the sudo password, so they are NOT committed** — they live only on nas at `~/.claude/projects/-home-amix-clerq2/memory/` so a Claude Code session started from `/home/amix/clerq2` has full context.

**Deployment gotchas:**
- **cloudflared can't read `credentials.json` → 530 / error 1033 + restart loop.** The `cloudflare/cloudflared` image runs as a **non-root** user; `cloudflared tunnel create` writes the credentials file mode `600` owned by `amix` (uid 1000), which the container user can't read. Fix: `chmod 644 deploy/cloudflared/credentials.json deploy/cloudflared/config.yml`, then recreate the cloudflared container. If you ever regenerate the tunnel credentials, re-apply the chmod.
- **Broken third-party apt repo blocks `get.docker.com`.** nas had a dead `packagecloud.io/ookla/speedtest-cli` source that made `apt-get update` exit non-zero, aborting the Docker install script. Disable the offending list in `/etc/apt/sources.list.d/` before installing.
- **Tunnel is locally-managed, not token-based.** The committed/template overlay also documents a token-based variant; the live deploy uses the locally-managed one (`config.yml` + `credentials.json`).
- **Email: never touch the `genitechs.ca` apex MX.** `info@genitechs.ca` is hosted on `mx{1,2,3}-hosting.jellyfish.systems` (apex MX). Do NOT enable Cloudflare Email Routing on the **apex** — it would replace those MX records and break `info@`. Inbound mail for the app rides **Resend Inbound on the `email.genitechs.ca` subdomain only** (its root had no MX, so adding the Resend inbound MX there is safe). The `send.email.genitechs.ca` return-path MX + `resend._domainkey` DKIM (outbound) are untouched. (Cloudflare Email Routing *does* now support subdomains, but we use Resend for both directions to stay single-vendor.)

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser                                │
│  localhost (nginx :80)                  │
│    /           → React SPA              │
│    /api/*      → proxy to api:8000      │
└─────────────────────────────────────────┘
              │
┌─────────────▼────────────┐   ┌─────────────────────┐
│  api (FastAPI :8000)     │   │  worker (Celery)     │
│  uvicorn w/ auto-reload  │──▶│  concurrency=2       │
│  SQLite + SQLAlchemy 2.0 │   │  same image as api   │
└──────────────────────────┘   └──────────┬───────────┘
              │                            │
              └──────────┬─────────────────┘
                         │
                ┌────────▼────────┐
                │  Redis :6379    │
                │  broker+backend │
                └─────────────────┘

Shared volume: ./data → /app/data
  /app/data/interpret.db          SQLite database
  /app/data/storage/          uploaded files + run output
```

Four Docker services, all defined in `docker-compose.yml`:

| Service | Image | Port | Role |
|---|---|---|---|
| `redis` | redis:7-alpine | internal only | Celery broker + result backend |
| `api` | interpret-api | 8000 | FastAPI — REST + SSE |
| `worker` | interpret-api (same) | none | Celery worker, CMD overridden |
| `frontend` | interpret-frontend | 80 | nginx serving Vite build + proxy |

**Critical:** Redis has no host port mapping intentionally — a local Redis on the host was conflicting with port 6379. Containers talk to each other via the `redis` hostname on the internal Docker network.

---

## Directory Structure

```
interpret/
├── CLAUDE.md                 ← you are here
├── docker-compose.yml
├── .env                      ← actual secrets (not committed)
├── .env.example              ← template
├── data/
│   ├── interpret.db              ← SQLite database (auto-created on startup)
│   └── storage/              ← uploaded PDFs + rendered PNGs
│       └── run_{id}_doc_{id}_pages/
│           └── page_NNNN.png
│
├── api/
│   ├── Dockerfile            ← python:3.11-slim, installs via uv
│   ├── pyproject.toml        ← dependencies (FastAPI, Celery, pymupdf, python-docx, openpyxl, etc.)
│   └── app/
│       ├── main.py           ← FastAPI app, CORS, router registration, startup
│       ├── config.py         ← Pydantic Settings (DATABASE_URL, REDIS_URL, STORAGE_PATH)
│       ├── database.py       ← SessionLocal, Base, get_db, create_tables()
│       │
│       ├── models/
│       │   ├── workflow.py         ← Workflow (id, name, definition, is_archived, is_favorite, current_version_num)
│       │   ├── workflow_version.py ← WorkflowVersion (id, workflow_id, version_num, definition)
│       │   ├── document.py         ← Document (filename, original_filename, file_path, mime_type, size_bytes)
│       │   └── run.py              ← WorkflowRun + WorkflowRunStep + WorkflowRunDocument (join table for multi-doc sets)
│       │
│       ├── schemas/
│       │   ├── workflow.py   ← Pydantic request/response models for workflows
│       │   ├── document.py   ← DocumentOut schema
│       │   └── run.py        ← RunOut, RunStepOut, TriggerRunIn schemas
│       │
│       ├── routers/
│       │   ├── workflows.py  ← CRUD + archive/unarchive + favorite/unfavorite + GET versions + POST restore + enable/disable-inbox
│       │   ├── documents.py  ← POST /api/documents/upload, GET /api/documents/
│       │   ├── runs.py       ← POST /api/runs (records version_id+version_num), GET list/detail
│       │   ├── sse.py        ← GET /api/runs/{id}/stream — SSE real-time updates
│       │   ├── files.py      ← GET /api/files/{path:path} — serve storage files (path traversal protected)
│       │   ├── library.py    ← CRUD /api/library/ + sample upload/delete
│       │   ├── policies.py   ← CRUD /api/policies/ + rule CRUD + reorder + version history + restore + enable/disable-inbox
│       │   ├── mail.py       ← GET /mailboxes, POST /inbound (triggers run), GET /messages
│       │   ├── review.py     ← Phase 6 human review: PATCH finding (note/override), POST finalize, POST reopen
│       │   └── reference_lists.py ← Phase 7 reference lists CRUD (/api/reference-lists)
│       │
│       ├── models/  (additions)
│       │   ├── document_type.py  ← DocumentType + DocumentTypeSample
│       │   ├── policy.py         ← Policy (+ current_version_num, email_inbox_enabled, email_address) + PolicyRule + PolicyVersion
│       │   └── mail.py           ← MailMessage (id, run_id, document_id, direction, from_addr, to_addr, subject, body, created_at)
│       │
│       ├── schemas/  (additions)
│       │   ├── library.py    ← DocumentTypeOut, DocumentTypeSampleOut, DocumentTypeCreate/Update
│       │   ├── policy.py     ← PolicyOut (+ email_inbox_enabled, email_address), PolicyRuleOut, PolicyCreate/Update, PolicyRuleCreate/Update, PolicyVersionOut
│       │   └── mail.py       ← MailboxOut, MailInboundRequest, MailMessageOut
│       │
│       └── tasks/
│           ├── celery_app.py  ← Celery instance + config; MUST import all ORM models here
│           ├── registry.py    ← NODE_REGISTRY: dict mapping node_type str → task function
│           ├── executor.py    ← topological sort (Kahn's) + Celery chain builder; trigger_run(run_id, definition, docs: list[Document])
│           └── nodes/
│               ├── base.py                ← mark_step_running/done/failed, mark_run_running/done/failed, step_log
│               ├── ingest.py              ← "input" node task; emits step_log lines
│               ├── pdf_to_images.py       ← "pdf_to_images" node task; uses pymupdf (fitz); emits step_log lines
│               ├── validate_documents.py  ← "validate_documents" node; calls OpenRouter vision API; accepts PDF/image direct input; emits step_log lines
│               ├── output.py              ← "output" node task; optionally copies files to output_folder; emits step_log lines
│               └── show_results.py        ← "show_results" node task; passthrough — logs, marks done, returns input_data unchanged
│
└── frontend/
    ├── Dockerfile            ← multi-stage: node build → nginx serve
    ├── nginx.conf            ← proxy /api to api:8000; client_max_body_size 100M; proxy_buffering off for SSE
    ├── vite.config.ts        ← dev server proxy /api → localhost:8000
    ├── tailwind.config.ts
    └── src/
        ├── main.tsx          ← React root
        ├── App.tsx           ← Routes + wraps everything in ThemeProvider + QueryClientProvider
        ├── index.css         ← Tailwind base + CSS theme variables (:root light / .dark) + React Flow overrides
        │
        ├── context/
        │   ├── theme.tsx     ← ThemeProvider, useTheme() — mode: light|dark|system; persists to localStorage; applies .dark class on <html>
        │   └── i18n.tsx      ← I18nProvider, useI18n() → {lang, setLang, t}; en|fr (Quebec French); persists to localStorage key `lang`
        │
        ├── lib/
        │   ├── reportExport.ts        ← JSON/CSV/PDF export (takes `t`/`lang` params — see i18n section)
        │   └── i18n/
        │       ├── dictionary.ts      ← aggregates strings/*.ts via import.meta.glob (no edit needed to add a namespace)
        │       └── strings/*.ts       ← one file per namespace: exports flat {en, fr} with namespaced keys (e.g. 'validate.title')
        │
        ├── types/
        │   └── workflow.ts   ← All shared TS types (Workflow, Run, RunStep, SSERunUpdate, etc.)
        │
        ├── api/
        │   ├── client.ts     ← axios instance (baseURL: /api)
        │   ├── workflows.ts  ← useWorkflows, useWorkflow, useCreateWorkflow, useUpdateWorkflow, useArchiveWorkflow, useUnarchiveWorkflow, useFavoriteWorkflow, useUnfavoriteWorkflow, useWorkflowVersions, useRestoreVersion, useEnableWorkflowInbox, useDisableWorkflowInbox
        │   ├── runs.ts       ← useRuns, useRun, useTriggerRun, useCancelRun, useUploadDocument, useDocuments
        │   ├── validate.ts   ← useValidateRuns(policyId?), useTriggerValidateRun
        │   ├── metrics.ts    ← useInsights(policyId?, source) — operational indicators (§2.2.1.4)
        │   └── mail.ts       ← useMailboxes, useMailMessages (5s poll), useSendMail
        │
        ├── pages/
        │   ├── Dashboard.tsx       ← Widget grid for favorited workflows (at /); per-widget file drop + SSE streaming + results sidebar
        │   ├── Validate.tsx        ← Policy list + run launcher (/validate); sidebar nav label = "Policies"; left panel = policy picker with inline create; right panel = live run queue with per-rule status
        │   ├── MailInbox.tsx       ← Fake email compose + inbox (/mail); left = compose panel (From/To/Subject/Body/Attach/Send); right = message list with inbound+outbound rows
        │   ├── Insights.tsx        ← Operational indicators (/insights); 6 metric cards + verdict breakdown bars + per-day load chart + per-dossier table + CSV export; policy filter
        │   ├── WorkflowList.tsx    ← Workflow list: create/archive/star; routed at /workflows
        │   ├── WorkflowEditor.tsx  ← Main page: React Flow canvas + NodeConfigPanel/NodePalette + VersionsModal
        │   ├── RunHistory.tsx      ← Run log for a workflow; shows version badge (v3) per run
        │   └── Settings.tsx        ← Appearance (light/dark/system theme picker) + OpenRouter API key/model
        │   NOTE: PoliciesList.tsx is retired — policy list lives inside Validate.tsx
        │
        └── components/
            ├── LeftSidebar.tsx       ← Nav sidebar (220px, Linear-style); Dashboard first, then Workflows
            ├── NodePalette.tsx       ← Right sidebar when no node selected; draggable node list
            ├── NodeConfigPanel.tsx   ← Right sidebar when a node is selected; node-specific config fields
            ├── RunStatusPanel.tsx    ← Fixed bottom bar (global, persists across navigation): live step status via SSE + REST fallback, Stop button, dismiss (X) button; rendered in App.tsx via GlobalRunStatus + RunContext
            ├── RunOutputViewer.tsx   ← Full-screen image grid modal with lightbox
            ├── VersionsModal.tsx     ← Version history modal; shows all versions with node count + restore button
            └── nodes/
                ├── InputNode.tsx          ← "input" node component (source handle bottom, indigo)
                ├── PdfToImagesNode.tsx    ← "pdf_to_images" node (target top, source bottom, amber; shows scale)
                ├── OutputNode.tsx         ← "output" node (target handle top, emerald; shows output_folder)
                └── ShowResultsNode.tsx    ← "show_results" node (target handle top, violet; terminal node for dashboard display)
```

---

## Cases (Dossiers) — v2.1.0

The **Case** is the central operator-facing unit. A case is a durable container that owns the email thread, accumulating documents, a policy-derived requirements checklist, and all runs fired over those documents. Every `WorkflowRun` now has a `case_id` (set at creation time). Cases are **implicit** — each run creates one automatically; they become visible in the Cases list when they have email activity, multiple runs, or are not trivially closed.

**New tables** (migration `0009_cases`):
- `cases` — the dossier: `tenant_id, name, status, target_kind, policy_id, workflow_id, contact_email, contact_name, external_ref, last_activity_at, closed_at`
- `case_aliases` — routing table: `(tenant_id, alias_type, alias_value)` unique. `alias_type="email_token"` for email threading. Future: `"api_ref"`, `"sharepoint_folder"`.
- `case_documents` — accumulating doc set with supersession: `case_id, document_id, source, superseded_by_id, position`. Active set = rows where `superseded_by_id IS NULL`.

**New columns**: `workflow_runs.case_id`, `mail_messages.case_id` (both nullable FK to `cases.id`).

**Case service** (`api/app/cases.py`): pure functions (`resolve_or_create_case`, `attach_run_to_case`, `attach_document_to_case`, `current_document_ids`, `compute_checklist`, `new_email_token`, etc.). All channels call `resolve_or_create_case` — it finds an existing case via `email_token` (case-insensitive) or `external_ref`, or creates a new one.

**Email threading**: outbound replies have `Reply-To: <mailbox-local>+<token>@<domain>`. Inbound resolution strips the `+token` via `_parse_email_token()` before the mailbox lookup, then resolves the case from the token. Tokens are lowercase (case-insensitive lookup via `func.lower()`). See `api/app/routers/mail.py::_parse_email_token`.

**Checklist derivation**: from `PolicyRule.document_type_id` (existing FK) + latest completed run's `validate_documents` `per_document` n/a markers. No new policy fields needed. Workflow-target cases have an empty checklist.

**New API router** (`/api/cases`, `api/app/routers/cases.py`):
```
GET  /api/cases/                          → CaseListItem[]  (view=, status=, target=, q=)
POST /api/cases/                          → CaseDetail       manual create
GET  /api/cases/{id}                      → CaseDetail       (timeline + checklist + documents)
PATCH /api/cases/{id}                     → CaseDetail       status/contact/external_ref
POST /api/cases/{id}/documents            → CaseDetail       attach uploaded docs
POST /api/cases/{id}/run                  → Run              fire run over current doc set
POST /api/cases/{id}/reply                → {id, sent_to, subject}   real + in-app reply
POST /api/cases/{id}/notes                → {id}             internal note (direction="note")
```

**Default "interesting" list filter**: has MailMessage OR status not in (closed_accepted, closed_rejected). Trivial one-shot runs that never received a reply stay invisible until something correlates to them.

**Frontend**: `frontend/src/pages/CasesPage.tsx`, `CaseDetailPage.tsx`, `frontend/src/api/cases.ts`, `frontend/src/lib/i18n/strings/cases.ts`.

**Inline review drawer (v3.2.0) — `frontend/src/components/CaseReviewDrawer.tsx`.** On the Case detail page, clicking a checklist **requirement** that shows "Issues found" (or a document, or the verdict banner's **"Review & resolve"** button) opens a right-side drawer that lets the operator handle each finding **without opening the raw PDF or the full report**. The drawer: `useRun(latestRunId)` + `usePolicy` + `getValidationOutput`; left = findings list ordered **problems-first** (by *effective* status, i.e. after any reviewer override); right = the selected finding's evidence ("What we found"), per-document breakdown, extracted fields, and a **pinned action footer** (always visible, no scrolling needed) with **Pass / Amend / Reject**; far-right (lg+) = a **document preview** column of the run's rendered page images with click-to-zoom lightbox (mobile gets an inline thumbnail strip). Pass/Reject set a reviewer **override** (`overrideStatus` `pass`/`fail`, reason required when it differs from the AI verdict); Amend saves an internal **note** — all via the existing **`useAnnotateFinding`** (`PATCH /api/runs/{id}/review/finding/{rule_name}`), so it writes to `workflow_runs.review` exactly like the report page. On success it also invalidates `['cases', caseId]`. Requirement→finding mapping uses `PolicyRule.document_type_id` to pre-select the relevant finding; falls back to the first problem. Only enabled once a completed validation run exists (`latestRunId`). The case verdict banner/checklist still reflect the **AI** overall (overrides change the report's effective verdict, not the case banner — by design). Wired in `CaseDetailPage.tsx`: `RequirementsPanel` rows + document rows are buttons, `VerdictBanner` gained `onReview`, and an `openReview(docTypeId?)` handler opens `<CaseReviewDrawer>`. **No landing-page sync needed** — this drawer is not one of the mockups recreated on the marketing site.

**Gotchas:**
- `case_aliases.alias_value` is stored lowercase since v2.1.0 (old aliases may be mixed-case — lookup uses `func.lower()` for safety).
- `RunOut.document_id` is `int | None` (was `int`) — some mail runs have no primary doc.
- The `Case` ORM class name conflicts with SQLAlchemy's internal `sqlalchemy.sql.elements.Case` when running ad-hoc scripts that don't import all models. In the API context (all models loaded through routers), this is not an issue.
- Celery worker must import `app.models.case` (already added to `celery_app.py`).
- `resend_inbound` webhook text-only mail (no attachment) now lands on the case timeline without firing a run and sets case status to `under_review`. The UI fixture (`/api/mail/inbound`) still creates a failed run for text-only (original behavior for test consistency).

---

## Demo use cases & sample data (customer-facing) — v3.1.0

Three persona-driven validation use cases ship as **config + data only** (no use-case-specific code), seeded by `samples/demo/seed.py` (idempotent): **Immigration** (Express Entry PR), **Mortgage** (lender-ready borrower package), **HR onboarding**. Each = Library document types, optional reference lists, a versioned Policy (per-document / any-document / cross-set / completeness rules), and a favorited Workflow of shape `input → pdf_to_images → validate_documents → condition(non-conforme?) → { wait-for-documents → send_email | show_results } → output`. `samples/demo/generate_samples.py` produces synthetic fake documents (PDF/Word) under `samples/<usecase>/{clean,problem}/`; `samples/demo/run_scenario.py` runs a dossier end-to-end through the live engine. Per-use-case **marketing landing pages** live at `website/interpret/{immigration,mortgage,onboarding}.html` (linked from the use-cases section of `website/interpret/index.html`). The confidential MELCCFP *recevabilité* example (`samples/recevabilite/`) has no public landing page. Verified live (with an OpenRouter key): clean dossiers → Pass, problem dossiers → Fail on exactly the broken rules. See `samples/demo/README.md`.

**Date-aware validation (generic feature):** `validate_documents`'s prompt (`_build_prompt`, in `app/tasks/nodes/validate_documents.py`, reused by the engine handler) now injects **today's date** so date-based rules (expiry, recency, validity windows, "not expired") evaluate correctly — the model otherwise guesses the current date from its training cut-off, breaking those checks. (Worker must be restarted to pick up prompt changes — it doesn't auto-reload.)

> **LANDING-PAGE ↔ APP-SCREEN SYNC RULE (do this every time the relevant app screens change):** The Interpret use-case landing pages (`website/interpret/{immigration,mortgage,onboarding}.html`) and the product landing (`website/interpret/index.html`) contain **hand-built HTML/CSS recreations of real app screens** — NOT raster screenshots (deliberate: HTML mockups reflow on mobile, the "extremely responsive" requirement). These mockups depict: the **validation report / verdict view** (`frontend/src/components/ReportView.tsx` — verdict banner, problems-first finding list, status badges, evidence, per-document section), the **status/verdict vocabulary & styling** (pass/fail/uncertain/not_applicable + Recevable/Non recevable/Information manquante), the **workflow editor node graph** (node cards/colors/labels in `WorkflowEditor.tsx` + `components/nodes/*` — input/pdf_to_images/validate_documents/condition/completeness_gate/show_results/output), the **Checks/Validate console** (`frontend/src/pages/Validate.tsx`), and each use-case's **rule checklist** (mirrors the seeded demo policy rules in `samples/demo/seed.py`). **Whenever any of those app screens change** — report layout, badge/verdict colors or labels, node visual design or node-type set, the Validate screen, or a demo policy's rule set — you MUST: (1) update the corresponding mockup(s) in the `website/interpret/*.html` pages to match, (2) **tell the user** which pages were re-synced and why, and (3) **regenerate the cPanel zip** (below) and report its path. Treat this as part of "done" for any task that touches those screens.

> **GA4 (Google Analytics) — LIVE:** every page (`website/index.html`, `website/interpret/index.html`, and the 3 use-case pages) carries the **active gtag.js GA4 snippet** in `<head>` (right after the SEO meta block), all on the **same Measurement ID `G-9JMH1MCWMW`**. If the ID ever changes, update it on all 5 pages.

> **SEO (top-notch, all 5 pages):** canonical base domain is **`https://genitechs.ca`** (the marketing site deploys to the apex; the Interpret *app* stays at the `interpret.` subdomain). Each page's `<head>` carries: `<link rel="canonical">`, `robots` (index,follow,max-image-preview:large), Open Graph (`og:type/title/description/url/site_name/locale/image` 1200×630 + alt), Twitter `summary_large_image`, and **JSON-LD structured data** — Genitechs index = `Organization` + `WebSite`; Interpret index = `SoftwareApplication` + `BreadcrumbList`; each use-case page = `WebPage` + `BreadcrumbList`. Site-root files: **`website/sitemap.xml`** (all 5 URLs, with `<image:image>`) and **`website/robots.txt`** (points to the sitemap). The **OG share images** `website/og-{genitechs,interpret,immigration,mortgage,onboarding}.png` are generated by **`samples/_og_gen.py`** (run in the api container — uses `fitz`, no new deps — then copy from `data/_og/` into `website/`). **When you add a new marketing page or change a title/description:** add it to `sitemap.xml` (and bump `<lastmod>`), give it canonical + OG/Twitter + JSON-LD, generate an OG image if appropriate, and **regenerate the cPanel zip** (see below).

> **cPanel deploy zip:** build it from the **contents of `website/`** (Genitechs at `/`, Interpret at `/interpret/`). Command (run from repo root): `cd website && zip -rX ../interpret-website.zip . -x '.DS_Store' '*/.DS_Store' 'Archive.zip' && cd ..`. The resulting `interpret-website.zip` (repo root, gitignored) is what the user uploads to `public_html`. Regenerate it after ANY change to `website/` (see the sync rule above) and report the path.

---

## Workflow Execution Engine v2 (v3.0.0) — durable graph scheduler

The linear-Celery-`chain` engine was replaced by a **durable, DB-as-source-of-truth graph scheduler** (full plan in [`docs/workflow-engine-rewrite-plan.md`](docs/workflow-engine-rewrite-plan.md)). It expresses any DAG (branch / fan-out / fan-in join / conditional skip / suspend-resume), completes runs **even with no terminal node** (fixes the old "never finishes without show_results" bug), and ships with a real test suite (`api/tests/`, **56 cases on Postgres**).

**Postgres everywhere (SQLite dropped).** `DATABASE_URL=postgresql+psycopg://…`; a `postgres:16` service is in `docker-compose.yml` (named volume `pgdata`). `database.py` is Postgres-only. The scheduler uses `SELECT … FOR UPDATE SKIP LOCKED` (atomic step claims) + `pg_advisory_xact_lock(run_id)` (per-run serialized `advance`). Migrations `0001–0009` were fixed for Postgres (integer→boolean literals + `lastrowid`→`RETURNING id` in `0002/0003/0009`).

**The engine package `api/app/engine/`:**
- `entry.py` — **`start_run(db, *, tenant_id, run_id, definition, documents, context_overrides=None)`** is THE entry point (replaces `executor.trigger_run`) + `cancel_run`. Re-exported as `app.engine.{start_run,cancel_run,signal_event}`. The 4 call sites (`routers/{runs,validate,mail,cases}.py`) use it.
- `scheduler.py` — `validate_graph` (Kahn), `start_run`, `claim_ready_step`, `process_step` (claim→handler→commit; **handler runs OUTSIDE any DB txn**), `advance_run` (satisfy deps + skip-propagation fixpoint + ready + completion; **loads steps+deps ONCE and mutates in memory** because `SessionLocal` is `autoflush=False` — re-querying mid-fixpoint double-counts the join), `fail_step` (retry while `attempt<max_attempts`), `_pick_result` (verdict-bearing leaf → `run.result`), `cancel_run`.
- `context.py` — `StepContext` (`config`, `inputs={upstream_node_id:output}` with a `_run` seed, `documents()`, `primary_input()`, `setting()`, `check_cancelled()`, `storage`, `log`, `idempotency_key`) + result types `Output` / `Suspend` / `Branch` + `StepFailed` / `CancelledError`.
- `handlers/` — the **`HANDLERS`** registry (node_type→fn), replacing `NODE_REGISTRY`. The 8 ported nodes + `condition` + `completeness_gate` (+ test-only `echo`).
- `tasks.py` — Celery `engine.execute_step` (`acks_late`), `engine.advance_run`, `engine.sweep`, `engine.signal_event`. The queue is only a wakeup hint; the DB is truth.
- `reconciler.py` — the sweeper (run by `beat` every 10s): requeue expired leases, fire due timers, re-derive stranded `ready`. The safety net so no run is ever stuck.
- `events.py` — `signal_event(event_type, match_key, payload)` resumes `waiting` steps.
- `storage.py` — `Storage` interface + `LocalStorage` (`get_storage()`; S3 later); handlers do all file IO through `ctx.storage`.

**New tables** (migration `0010_execution_engine_v2`, additive): `run_steps` (status `pending→ready→running→succeeded|failed|skipped|waiting|cancelled`, `deps_remaining` join counter, `inputs`/`output_data`/`config` JSON, `attempt`/`max_attempts`, `lease_*`, `idempotency_key`, `parent_step_id`), `step_deps` (materialized edges: `from/to_step_id`, `source_handle`, `satisfied`, `live`), `run_events` (suspend/timer: `event_type`, `match_key`, `fire_at`, `status armed→fired`). `workflow_runs` gained `definition_snapshot`, `result`, `fail_policy`.

**Legacy code kept but dead** (pending cleanup): the old `tasks/executor.py`, `tasks/registry.py`, `tasks/nodes/*` task functions, and the `workflow_run_steps`/`workflow_run_documents` tables are no longer used (`WorkflowRun.steps` → `RunStep`; `document_ids` derives from the run seed). Deletion is deferred only because the new validate handler still imports `_build_prompt`/`_merge_per_doc_results` from `app.tasks.nodes.validate_documents` (move them into the engine, then delete).

**Status vocab.** Steps: `pending|ready|running|succeeded|failed|skipped|waiting|cancelled` — **success is `succeeded`, not `completed`**. Runs: `pending|running|waiting|completed|failed|cancelled` (`cancelled` is D4-distinct from `failed`). `cases.validation_output(run)` (prefers `run.result`, falls back to the validate step) is the single reader `cases`/`review`/`metrics` use. SSE (`routers/sse.py`) has no 5-min cap (parked `waiting` runs stream), emits on change, carries `result`+`attempt`. Frontend `StepStatus`/`RunStatus` unions + every status switch updated; `useRun` polls while `waiting`.

**Adding a handler (engine-v2):** write `engine/handlers/foo.py` (a `(StepContext)->Output|Suspend|Branch` fn), register it in `engine/handlers/__init__.py` `HANDLERS`; for an editor node also add the frontend component + `NODE_TYPES` (WorkflowEditor) + palette ITEMS + `.react-flow__node-foo` in `index.css` + NodeConfigPanel config. (The old celery `NODE_REGISTRY` path is dead.)

**New node types:** `condition` (structured predicate `{field,op,value}`, no eval → `Branch(live_handles=["true"|"false"])`; the other edge is pruned + its sub-branch transitively skipped — handles must be `id="true"/"false"`) and `completeness_gate` (`{required_doc_types,timeout_days}` → `Suspend` until the case's docs cover the required types or the timeout fires; the cases doc-attach endpoint wakes it via `engine.signal_event("document_added", case_id)`). Showcase workflow: `samples/demo-workflow/seed.py` (run via `docker compose exec -T api python - < samples/demo-workflow/seed.py`). **Editor UX:** these are presented in plain language for non-technical users — **Decision** shows a "When the validation result is [Conforme/Non conforme/Information manquante]" dropdown (+ an Advanced field/op/value escape hatch) and its card reads "If result is …" with **Yes/No** branch labels (engine handle ids stay `true`/`false`); **Wait for documents** shows document-type **checkboxes pulled by name from the Library** (writing `required_doc_types` ids behind the scenes) + "Give up after N days". The node palette + config panel are `overflow-y-auto` (they scroll — a fixed-height clip bug was fixed when the palette grew to 10 items).

**Services + tests.** `docker-compose.yml` now has `postgres` + `beat` (Celery beat → `engine.sweep`). Rebuild after engine/handler changes: `docker compose build api worker beat && docker compose up -d --force-recreate api worker beat`. Run tests: once `docker compose exec postgres psql -U interpret -d interpret -c "CREATE DATABASE interpret_test"`, then `docker compose run --rm -e DATABASE_URL=postgresql+psycopg://interpret:interpret@postgres:5432/interpret_test --entrypoint pytest api -q`.

---

## Database Schema

Tables are created automatically on API startup via `create_tables()` then `run_migrations()` in `database.py`. New tables are created by `create_all()`; new columns on existing tables are added via safe `ALTER TABLE ADD COLUMN` with try/except (SQLite-compatible). Never drop data; use archive flags instead.

**Phase 1A (multi-doc support):** Added `workflow_run_documents` join table. `trigger_run` now accepts `docs: list[Document]`. The `input`, `pdf_to_images`, and `validate_documents` nodes all handle a `documents: [...]` list in their input/output data. Validation results include a `per_document` array on each rule entry when multiple documents are evaluated.

**Phase 2 (Word/Excel/CSV ingestion):** `pdf_to_images` detects `.docx`, `.xlsx`, `.xls`, `.csv` by extension and extracts text instead of rendering pages. Each doc entry in the output now carries either `image_paths` (PDF/image) or `text_content` (str, capped at 50 K chars). `validate_documents` passes text docs as `{"type": "text", ...}` content blocks alongside `image_url` blocks — the AI sees both. Mixed sets (PDF + Word + CSV in one run) work end-to-end. New dependencies: `python-docx`, `openpyxl`. The Validate screen file input now accepts `.docx,.xlsx,.xls,.csv` in addition to PDF and images.

**Phase 5 (durable report + PDF/JSON/CSV export):** A report is now a first-class artifact with its own stable URL `/reports/:runId` (the `ReportPage` component). The shared `frontend/src/components/ReportView.tsx` renders the report as a self-contained "paper" document (eyebrow + title + policy/version/docs/run/date meta + verdict banner + counts + findings sorted **problems-first** — fail → uncertain → pass → not_applicable). It carries its own stylesheet (`REPORT_CSS`) using fixed print-friendly colors — NOT app theme tokens — so the on-screen page and the exported PDF are visually identical by construction. Export helpers live in `frontend/src/lib/reportExport.ts`: `exportReportJSON` and `exportReportCSV` are client-side Blob downloads; `printReportPDF` renders `ReportView` via `react-dom/server`'s `renderToStaticMarkup`, opens the HTML via a **Blob URL** (not `document.write` — that fails across opener contexts), and the embedded onload script triggers `window.print()`. The `RunDetailModal` in `Validate.tsx` gained a header export bar (CSV / JSON / PDF / Open) that mirrors the report page's actions. Handles `not_applicable` status (gray "N/A" badge), `cross_set` rules (violet "across set" tag + "Documents compared" chip list), and `any_document` rules (sky "any doc" tag). **Gotcha:** when opening a popup for the PDF, do NOT pass `noopener`/`noreferrer` — that strips the write capability in Chromium; the Blob-URL approach sidesteps this entirely.

**Phase 6 (light human review on the report):** A reviewer can annotate findings, override the AI verdict (with a required reason), and finalize a report — no queues/assignment/multi-tenant. State lives in a new JSON `workflow_runs.review` column (migration in `database.py`): `{ state: draft|finalized, annotations: { <rule_name>: { note, override: {status, reason}, updated_at } }, history: [...], finalized_at, effective_overall }`. The AI's original verdict is **never erased** — overrides layer on top and the report shows "AI: X → Reviewer: Y — reason". Backend router `api/app/routers/review.py` (mounted under `/api/runs`): PATCH a finding, POST finalize, POST reopen; `_compute_overall` recomputes the effective verdict from overrides using the same precedence as `validate_documents` (any required fail → fail; else uncertain → needs_review; else pass) — it treats any `requirement` that isn't literally `"optional"` as required (defensive, because the cross-set path can leak the AI's free-text into the result's `requirement` field). Annotating a finalized report returns 409. Frontend: types + `ReportReview` in `types/workflow.ts`; hooks in `frontend/src/api/review.ts` (`useAnnotateFinding`/`useFinalizeReview`/`useReopenReview`, invalidate `['runs','detail',id]`). `ReportView` renders overrides/notes transparently, shows a Draft/Finalized ribbon, and recomputes the verdict/counts from **effective** statuses; it takes a `renderFindingControls` render-prop so the interactive page injects per-finding controls while the static PDF render omits them (`.no-print`). `ReportPage` provides the per-finding "Verdict" pill toggle (selecting the AI's own value clears the override; a different value requires a reason) + "Add note" composer, and a sticky bottom bar with **Finalize report** / **Reopen to amend**. JSON/CSV exports include effective status + reviewer note/override; the PDF reflects the finalized state. Attribution is timestamp-only for now (no auth); `updated_by`/`finalized_by` are placeholders for a future identity phase.

**Phase 7 (reference-data lookups):** A rule can check an extracted value against an editable **Reference List** (e.g. eligible appliance models, approved vendors, valid codes). New `reference_lists` table (`api/app/models/reference_list.py`: id, name, description, `items` JSON list of strings) + CRUD router `api/app/routers/reference_lists.py` (`/api/reference-lists`; items are trimmed, de-duplicated, blanks dropped). `PolicyRule` gains `reference_list_id` (FK), `reference_direction` (`in`|`not_in`), `reference_match` (`exact`|`smart`) — migration in `database.py`, included in the policy version snapshot/restore. In `validate_documents`, reference lists are **pre-loaded while the DB session is open** (into a `reference_specs` map keyed by rule name) and injected per-rule into the prompt by `_reference_clause`: exact = strict case-insensitive membership, smart = tolerant of spelling/format variants; the AI is told to name the list + value in evidence. The whole check rides the existing single AI call (no separate deterministic pass). Frontend: `ReferenceList` type + `api/referenceLists.ts` hooks; the **Library page is now tabbed** (`Document types` | `Reference lists`) with a spreadsheet-style editor modal (one value per line, paste a column); the PolicyEditor rule card's Advanced section gains a self-assembling control — *"The value must be [in|not in] [list ▾]"* + an Exact/Smart match toggle. Verified end-to-end: an off-list value fails, an on-list value passes, and editing the list flips the verdict on the next run.

**Operational indicators / suivi (§2.2.1.4):** A read-only **Insights** page (`/insights`, `frontend/src/pages/Insights.tsx`) surfaces the six operational indicators the RFP's monitoring module requires — **# dossiers traités**, **# éléments non conformes détectés**, **temps moyen de génération du RT**, **taux de validation humaine sans modification**, **indicateurs de charge** (dossiers/jour), **# corrections après génération initiale** — plus a verdict breakdown (Recevable/Non recevable/Information manquante) and a per-dossier table, with a client-side **CSV export**. All numbers are aggregated by `GET /api/metrics/insights` (`api/app/routers/metrics.py`) purely from existing `WorkflowRun` / `WorkflowRunStep` / `review` data — **no new tables, no use-case-specific logic** (a generic feature). RT-generation time is the wall-clock span from first step `started_at` to last step `completed_at` (run-level `started_at` is unset for the canonical validate pipeline). "Validation without modification" = finalized reviews with zero overrides; "corrections" = reviewer overrides + reopen events. Filterable by policy. Nav entry "Indicateurs" (BarChart3 icon).

**Internationalization (EN/FR, §2.5.1):** The whole UI is bilingual via `frontend/src/context/i18n.tsx` (`useI18n()` → `{lang, setLang, t}`, persists to `localStorage.lang`, defaults from `navigator.language`). Strings live in `frontend/src/lib/i18n/strings/*.ts` (one flat `{en, fr}` module per namespace, auto-aggregated by `dictionary.ts` via `import.meta.glob` — add a namespace file, no wiring needed). Quebec-French conventions; verdict labels render as **Recevable / Non recevable / Information manquante**. `validate_documents` now instructs the model to write each finding's **evidence in the same language as the rule** it evaluates (so a French-authored policy yields French evidence). Language toggles in Settings.

**Phase 4 (MELCCFP recevability example — config & data, the capstone):** A ready-made end-to-end example of the RFP use case, built entirely from generic features (no MELCCFP-specific app code). Lives under `samples/recevabilite/`: two synthetic dossiers in mixed formats (`dossier-recevable/` = Word form + PDF annex + CSV inventory + PDF antecedents declaration; `dossier-non-recevable/` = a deliberately broken variant — missing annex, applicant-name mismatch, off-list equipment) plus `seed.sh` which creates the Library document types, the "Équipements admissibles (LQE)" reference list, and the "Recevabilité — Autorisation ministérielle (LQE)" policy (6 rules: signature+date per-doc, French per-doc, completeness cross-set, applicant-name consistency cross-set, wetland→annex logical coherence cross-set, eligible equipment per-doc+reference-list) through the public API. The policy brief excludes the *Déclaration d'antécédents* and the engine's per-document relevance marks it `not_applicable`. Verified: the recevable dossier → **Pass** (antecedents N/A everywhere), the broken dossier → **Fail** on the four expected rules. The config itself lives in the local DB (gitignored); `seed.sh` recreates it. **One generic fix was required during this phase:** `validate_documents` `max_tokens` was raised 2048 → 8192, because a policy with many verbose rules could truncate the AI's JSON response mid-string and break parsing (a generic robustness fix, not MELCCFP-specific).

**Phase 3 (cross-set rules):** Each `PolicyRule` has a `scope` column — `per_document` (default) or `cross_set`. In multi-doc runs, `validate_documents` splits rules by scope: **per-document** rules are evaluated with one AI call per document then worst-case merged (existing behavior); **cross-set** rules get a single AI call seeing the WHOLE set (labeled `=== Document: "name" ===` blocks, image total capped at `MAX_SET_IMAGES=30`) so the model can compare documents against each other (consistency, conditional "if form A says Yes then form B present", etc.). Results are tagged with `scope` and re-ordered to match rule position. Cross-set results carry a `per_document` list of the documents compared (frontend renders these as a "Documents compared" chip list rather than per-doc pass/fail). Default `per_document` means existing policies behave identically — when no rule is `cross_set`, only the per-doc path runs. The PolicyEditor rule card has an "Each doc / Across set" toggle (violet) beside Required/Optional; the Validate report shows a "set" badge in the rule list and an "across set" badge in the detail header. Single-doc fallback (workflow editor) evaluates all rules in one call regardless of scope.

**Phase 4 (document relevance + `any_document` scope):** Fixes a packet bug where a rule like "Passport Is Valid" failed because it was checked against *every* document (the PR Card "failed" the passport rule) and worst-case merged. Two changes:
- **`not_applicable` status.** The per-document AI prompt now instructs the model to mark a rule `not_applicable` for a document that isn't the kind of document the rule concerns (e.g. a PR card for a passport rule), stating the document's actual type in `evidence`. The merge (`_merge_per_doc_results`) **excludes n/a documents** from the verdict. If *every* document is n/a for a required rule, the required document is absent → the rule fails with a synthesized "No document in the packet matches this rule. Documents reviewed: …" evidence. So even a plain `per_document` rule now ignores irrelevant documents.
- **Third scope `any_document`.** `PolicyRule.scope` is now `per_document` (every relevant doc must pass — worst-case among applicable) / `any_document` (≥1 relevant doc passes — best-case among applicable) / `cross_set`. `any_document` is for "the packet must contain a valid X". `any_document` rules use the same per-document AI path as `per_document`; only the merge differs. `_merge_per_doc_results(per_doc, rule_requirements, rule_scopes)` takes scopes and tags each result with its scope (no longer a blanket `per_document`).

No DB migration — `scope` is an existing free `String(32)` column. Single-doc fallback: a `not_applicable` on a **required** rule is converted to `fail` (the required doc isn't present); optional stays n/a. Overall computation treats any stray `not_applicable` on a required rule as `fail`. Frontend: PolicyEditor scope toggle is now three pills "Each doc / Any doc (sky) / Across set (violet)"; the Validate report adds an `any` badge (rule list) + "any document" badge (header) and renders `not_applicable` rows greyed with an `N/A` badge. `RESULT_BADGE`/`RESULT_LABEL`/`RESULT_ICON`/`RESULT_COLORS` and the various local `RuleStatus` types (Validate, ValidateDocumentsNode, NodeConfigPanel) all include `not_applicable`.

```sql
workflows (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  definition          JSON NOT NULL,   -- cached copy of latest version's definition (for fast list queries)
  is_archived         BOOLEAN NOT NULL DEFAULT 0,
  is_favorite         BOOLEAN NOT NULL DEFAULT 0,  -- true = show on Dashboard as interactive widget
  current_version_num INTEGER NOT NULL DEFAULT 0,
  created_at          DATETIME,
  updated_at          DATETIME
)

workflow_versions (
  id           INTEGER PRIMARY KEY,
  workflow_id  INTEGER REFERENCES workflows(id),
  version_num  INTEGER NOT NULL,   -- sequential per workflow; 1, 2, 3…
  definition   JSON NOT NULL,      -- {nodes: [...], edges: [...]}
  created_at   DATETIME
)
-- Every PUT /workflows/{id} with a definition creates a new row here.
-- Restore = new version that copies an old version's definition.

documents (
  id                INTEGER PRIMARY KEY,
  filename          TEXT NOT NULL,          -- UUID filename on disk
  original_filename TEXT NOT NULL,          -- original upload name shown in UI
  file_path         TEXT NOT NULL,          -- absolute path inside container
  mime_type         TEXT,
  size_bytes        INTEGER,
  created_at        DATETIME
)

mail_messages (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER REFERENCES workflow_runs(id),  -- nullable; links reply to the triggering run
  document_id  INTEGER REFERENCES documents(id),      -- nullable
  direction    TEXT NOT NULL,                         -- 'inbound' | 'outbound'
  from_addr    TEXT NOT NULL,
  to_addr      TEXT NOT NULL,
  subject      TEXT,
  body         TEXT,
  created_at   DATETIME
)
-- Created automatically on API startup via create_all(). No manual migration needed.
-- Inbound row: written by POST /api/mail/inbound when a message arrives.
-- Outbound row: written by show_results.py when run.sender_email is set.

workflow_run_documents (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER REFERENCES workflow_runs(id),
  document_id  INTEGER REFERENCES documents(id),
  position     INTEGER NOT NULL DEFAULT 0   -- order in the set (0 = primary)
)
-- Created by create_all() — no migration needed.
-- Populated by trigger_run() for all runs (single-doc runs get one row).
-- Exposed as run.document_ids in RunOut.

workflow_runs (
  id           INTEGER PRIMARY KEY,
  workflow_id  INTEGER REFERENCES workflows(id),
  document_id  INTEGER REFERENCES documents(id),
  version_id   INTEGER REFERENCES workflow_versions(id),  -- which version was run (nullable for pre-versioning rows)
  version_num  INTEGER,                                   -- denormalized for quick display
  name         TEXT,                                      -- human-readable run name; defaults to uploaded filename; later: extracted field from policy
  status       TEXT NOT NULL,              -- pending | running | completed | failed
  started_at   DATETIME,
  completed_at DATETIME,
  error        TEXT,
  created_at   DATETIME,
  review       JSON                                       -- Phase 6 human review (notes, verdict overrides, finalize/reopen, audit history); null until a reviewer touches it
)
-- name column: populated at run creation time (original_filename of the uploaded document).
-- Future: policy can declare an "extract this field" rule; the validate_documents node will
-- write the extracted value back to this column, replacing the filename with something like
-- "John Smith — Passport" or "Invoice #12345". Policy chaining will produce compound names.

workflow_run_steps (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER REFERENCES workflow_runs(id),
  node_id      TEXT NOT NULL,              -- matches node.id from React Flow definition
  node_type    TEXT NOT NULL,              -- input | pdf_to_images | output
  status       TEXT NOT NULL,             -- pending | running | completed | failed
  input_data   JSON,
  output_data  JSON,                      -- e.g. {image_paths: ["run_1_doc_1_pages/page_0001.png"]}
  error        TEXT,
  started_at   DATETIME,
  completed_at DATETIME,
  logs         TEXT                       -- JSON array of timestamped log strings written by step_log()
)
```

---

## API Endpoints

```
GET  /api/health                                          → {status: "ok"}

GET  /api/workflows/                                      → Workflow[]   (non-archived by default)
GET  /api/workflows/?include_archived=true                → Workflow[]   (all)
POST /api/workflows/                                      → Workflow     body: {name, definition?}
GET  /api/workflows/{id}                                  → Workflow
PUT  /api/workflows/{id}                                  → Workflow     body: {name?, definition?} — creates a new version
POST /api/workflows/{id}/archive                          → Workflow     (no delete; use archive instead)
POST /api/workflows/{id}/unarchive                        → Workflow
POST /api/workflows/{id}/favorite                         → Workflow     sets is_favorite=True
POST /api/workflows/{id}/unfavorite                       → Workflow     sets is_favorite=False
GET  /api/workflows/{id}/versions                         → WorkflowVersion[]  (newest first)
POST /api/workflows/{id}/versions/{vid}/restore           → Workflow     creates new version copying old definition

POST /api/documents/upload                                → Document     multipart file
GET  /api/documents/                                      → Document[]

POST /api/runs/                                           → Run          body: {workflow_id, document_id}
GET  /api/runs/{id}                                       → Run
GET  /api/runs/?workflow_id={id}                          → Run[]
POST /api/runs/{id}/cancel                                → Run          marks run+pending steps failed; queued Celery tasks bail at next step boundary

PATCH /api/runs/{id}/review/finding/{rule_name}           → Run          Phase 6 — set/clear a finding's note and/or verdict override;
                                                            body: {note?, clear_note?, override_status?, override_reason?, clear_override?}
                                                            a reason is required when override_status differs from the AI verdict; recomputes effective overall
POST /api/runs/{id}/review/finalize                       → Run          Phase 6 — lock the report as finalized (idempotent)
POST /api/runs/{id}/review/reopen                         → Run          Phase 6 — reopen a finalized report to amend (logged in history)

GET  /api/runs/{id}/stream                                → SSE stream   events: "update" | "done"
                                                            update data: {run_id, status, error, steps[]}
                                                            polls DB every 1s, max 300 iterations (~5 min)

GET  /api/files/{path:path}                               → FileResponse serves ./data/storage/{path}
                                                            path traversal protected (realpath check)

GET    /api/reference-lists/             → ReferenceList[]    Phase 7 — approved-value lists
POST   /api/reference-lists/             → ReferenceList      body: {name, description?, items: [str]}
GET    /api/reference-lists/{id}         → ReferenceList
PUT    /api/reference-lists/{id}         → ReferenceList      items are trimmed, de-duplicated, blanks dropped
DELETE /api/reference-lists/{id}         → 204

GET  /api/library/                       → DocumentType[]
POST /api/library/                       → DocumentType     body: {name, description?, ai_instructions?}
GET  /api/library/{id}                   → DocumentType     includes samples
PUT  /api/library/{id}                   → DocumentType
DELETE /api/library/{id}                 → 204
POST /api/library/{id}/samples           → DocumentTypeSample  multipart file
DELETE /api/library/{id}/samples/{sid}   → 204

GET  /api/policies/                                      → Policy[]
POST /api/policies/                                      → Policy           body: {name, description?, brief}
GET  /api/policies/{id}                                  → Policy           includes rules + linked document_type
PUT  /api/policies/{id}                                  → Policy           creates new PolicyVersion snapshot
DELETE /api/policies/{id}                                → 204
GET  /api/policies/{id}/versions                         → PolicyVersion[]  newest first; each has rule_count
POST /api/policies/{id}/versions/{vid}/restore           → Policy           creates new version copying old snapshot
POST /api/policies/{id}/rules                            → PolicyRule       also creates a PolicyVersion snapshot
PUT  /api/policies/{id}/rules/{rule_id}                  → PolicyRule       does NOT create a version (too frequent)
DELETE /api/policies/{id}/rules/{rid}                    → 204              also creates a PolicyVersion snapshot
PATCH /api/policies/{id}/rules/reorder                   → Policy           also creates a PolicyVersion snapshot
POST /api/policies/{id}/enable-inbox                     → Policy           email_inbox_enabled=True; email_address defaults to slug(name)@{MAIL_INBOUND_DOMAIN} (numbered suffix on collision)
PUT  /api/policies/{id}/inbox-address                    → Policy           {local_part} — rename the mailbox; 400 invalid, 409 if taken (global). Inbox must be enabled.
POST /api/policies/{id}/disable-inbox                    → Policy           sets email_inbox_enabled=False, email_address=None
POST /api/workflows/{id}/enable-inbox                    → Workflow         email_inbox_enabled=True; email_address defaults to slug(name)@{MAIL_INBOUND_DOMAIN} (numbered suffix on collision)
PUT  /api/workflows/{id}/inbox-address                   → Workflow         {local_part} — rename the mailbox; 400 invalid, 409 if taken (global). Inbox must be enabled.
POST /api/workflows/{id}/disable-inbox                   → Workflow         sets email_inbox_enabled=False, email_address=None

GET  /api/mail/mailboxes                                 → Mailbox[]        all enabled policy+workflow mailboxes
POST /api/mail/inbound                                   → Run              body: {to, from_email, subject?, body?, document_id?}
                                                           UI test fixture (tenant-scoped); matches recipient to policy/workflow, triggers run, stores sender_email for reply
POST /api/mail/resend-inbound                            → {ok, run_id?, …} REAL inbound webhook (NO auth; Svix-verified). Resend email.received →
                                                           resolves mailbox→tenant globally, downloads attachments→Documents, fires run.
                                                           Idempotent on Resend email_id (mail_messages.external_id). See "Real email" section.
GET  /api/mail/messages                                  → MailMessage[]    all inbound+outbound messages, newest first

GET  /api/metrics/insights?policy_id=&source=            → Insights         operational indicators (§2.2.1.4); source defaults to "validate"
                                                           totals{dossiers_processed, documents_processed, nonconformities_detected,
                                                           avg_rt_seconds, reviews_finalized, human_validation_rate,
                                                           corrections_after_generation} + verdict_breakdown + by_day[] + per_run[]
```

---

## Execution Flow

```
1. User designs workflow in React Flow editor
   → Saves: PUT /api/workflows/{id}  body: {definition: {nodes, edges}}
   → node.data stores user config (e.g. {scale: 2.0, output_folder: "exports"})

2. User uploads a PDF
   → POST /api/documents/upload (multipart)
   → Saved to /app/data/storage/{uuid}.pdf

3. User triggers a run
   → POST /api/runs  body: {workflow_id, document_id}
   → API creates WorkflowRun (status=pending)
   → executor.trigger_run() called:
       a. topological sort of nodes (Kahn's algorithm)
       b. creates WorkflowRunStep rows for each node (status=pending)
       c. builds Celery chain (see below)
       d. chain.delay() → enqueued to Redis

4. Celery worker executes chain
   → Each task receives: (input_data, run_id, step_id, node_config)
   → Task: mark step running → do work → mark step done → return output_data
   → Celery passes return value as first positional arg to next task in chain
   → On failure: mark step failed, mark run failed, chain stops

5. Frontend streams status
   → GET /api/runs/{id}/stream (SSE)
   → RunStatusPanel shows each step: pending → running → completed/failed
   → After pdf_to_images completes, "View images" button appears
   → Images served via GET /api/files/{relative_path}
```

---

## Celery Chain — Critical Detail

This is the trickiest part of the codebase. The chain data-threading is non-obvious:

```python
# executor.py — building the chain
if i == 0:
    # First task: explicitly pass initial_input as first positional arg
    sig = task_fn.s(initial_input, run_id=run_id, step_id=step.id, node_config=node_config)
else:
    # Subsequent tasks: NO first positional arg
    # Celery automatically injects the previous task's return value as input_data
    sig = task_fn.s(run_id=run_id, step_id=step.id, node_config=node_config)
```

```python
# All task functions have this signature:
@celery_app.task(name="nodes.xxx", bind=True)
def some_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    ...
    return output_data  # this becomes input_data for the next task
```

```python
# celery_app.py — MUST import all ORM models here
# Without this, the worker process doesn't know about FK targets and SQLAlchemy crashes
import app.models.workflow  # noqa: F401
import app.models.document  # noqa: F401
import app.models.run       # noqa: F401
```

---

## Node Data Contracts

| Node | input_data | output_data | node_config keys |
|---|---|---|---|
| `input` | `{document_id, file_path, mime_type}` | same | none |
| `email_input` | `{document_id?, file_path?, mime_type?}` | `{subject?, from?, to?, body?, file_path?, mime_type?, document_id?}` | `fields: string[]` (default all 5: subject/from/to/body/attachments) |
| `pdf_to_images` | `{document_id, file_path}` | `{document_id, image_paths: [str], page_count: int, text_content?: str}` | `scale` (float, default 2.0) |
| `ai` | anything from prev step (incl. `image_paths`, `file_path`) | `{...input_data, ai_response: string}` | `system_prompt` (str, required), `model` (str, OpenRouter model ID) |
| `validate_documents` | `{document_id, image_paths: [str], page_count: int}` or `{documents: [...]}` | `{policy_id, policy_name, policy_version_num, overall: pass/fail/needs_review, results: [...], image_paths, document_id}` — each result has `scope` (`per_document`/`any_document`/`cross_set`), `status` (`pass`/`fail`/`uncertain`/`not_applicable`), and `per_document: [...]` | `policy_id` (int, required), `model` (str, OpenRouter model ID), `fail_on_missing` (bool, default true) |
| `output` | previous step's output | `{manifest: {...}, status: "complete"}` | `output_folder` (str) |
| `send_email` | anything from prev step | `{...input_data, sent_to: str, sent_subject: str}` | `to` (str, supports `{{var}}`), `subject` (str), `body` (str) |
| `show_results` | previous step's output | same (passthrough) | none |

**Template syntax** (`{{variable}}`): The `ai` and `send_email` nodes support `{{key}}` in their config fields. Dot notation works for nested values (`{{results.0.rule_name}}`). Missing keys resolve to empty string. Dict/list values are JSON-serialized. Implemented in `api/app/tasks/nodes/template.py` — reusable by any future node.

**`send_email` node SENDS REAL EMAIL (v3.3.0).** The engine handler `app/engine/handlers/send_email.py` records the in-app `MailMessage` (case timeline) **and** sends a real email via Resend for real recipients — mirroring `show_results._send_reply`: addresses ending `@interpret.local` (the in-app test fixture) stay in-app only; `reply_to` is the policy/workflow mailbox tokenized with the case token so the recipient's reply loops back into the same case (this is what makes the "wait for documents" branch work). Idempotency-guarded by the step's `idempotency_key` (recorded as `MailMessage.external_id`). *(Before v3.3.0 the node only recorded in-app and never delivered — the demo workflows' "email the applicant" branch silently no-op'd.)*

**Run context auto-seeds recipient fields (v3.3.0).** `scheduler.start_run` seeds **`contact_email`, `contact_name`, `sender_email`** into the `_run` seed from the run's `sender_email` and (if `case_id` set) the case's contact — so `{{contact_email}}` / `{{contact_name}}` resolve in `send_email`/`ai` node templates for any run fired from a **case** or **inbound mail**. Explicit `context_overrides` still win. *(Before this, those template vars rendered empty → `send_email` raised "requires a 'to' address" and the workflow run failed.)* The demo workflows email `{{contact_email}}` (see `samples/demo/seed.py`).

**email_input** is a source node (no target handle). It reads `MailMessage` for the current run (`direction="inbound"`) and exposes the selected fields. It always passes `file_path`/`document_id` through so downstream nodes (pdf_to_images, ai) can access attachments.

`show_results` is a terminal node (no source handle). Its completed `output_data` is what the Dashboard sidebar renders. The Dashboard auto-detects the data type: `overall` present → validation result view; `image_paths` present → 2-col image grid; otherwise → pretty-printed JSON.

`image_paths` are stored as **relative paths** from `STORAGE_PATH` (e.g. `"run_1_doc_1_pages/page_0001.png"`). The frontend constructs image URLs as `/api/files/{relative_path}`.

---

## React Flow — Important CSS

React Flow applies its own styles to node wrapper divs that create white backgrounds and wrong sizing. These are stripped in `frontend/src/index.css`:

```css
.react-flow__node-input,
.react-flow__node-output,
.react-flow__node-pdf_to_images,
.react-flow__node-validate_documents,
.react-flow__node-default {
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  /* ... etc */
}
```

**When adding a new node type `foo`, add `.react-flow__node-foo` to this list**, otherwise it gets a white box.

Current node type CSS classes registered: `input`, `output`, `pdf_to_images`, `validate_documents`, `show_results`, `email_input`, `ai`, `send_email`.

---

## Adding a New Node Type

Checklist — do all of these or the new node won't work:

**Backend:**
1. `api/app/tasks/nodes/foo.py` — implement task with correct signature
2. `api/app/tasks/registry.py` — add `"foo": foo_task` to `NODE_REGISTRY`
3. `api/app/tasks/celery_app.py` — add `"app.tasks.nodes.foo"` to `include` list

**Frontend:**
4. `frontend/src/components/nodes/FooNode.tsx` — React component
5. `frontend/src/index.css` — add `.react-flow__node-foo` to the style-reset block
6. `frontend/src/pages/WorkflowEditor.tsx` — add `foo: FooNode` to `NODE_TYPES`
7. `frontend/src/components/NodePalette.tsx` — add entry to `ITEMS`
8. `frontend/src/components/NodeConfigPanel.tsx` — add config fields for `foo`
9. `frontend/src/components/RunHistory.tsx` — add label to `NODE_LABELS`
10. `frontend/src/components/RunStatusPanel.tsx` — add label to `NODE_LABELS`

Then rebuild: `docker compose build api worker frontend && docker compose up -d --force-recreate`

---

## Environment Variables

```
DATABASE_URL=sqlite:////app/data/interpret.db
REDIS_URL=redis://redis:6379/0
STORAGE_PATH=/app/data/storage
SECRET_KEY=change-me-in-production
OPENROUTER_API_KEY=           ← required for validate_documents node (now per-tenant; set via Settings UI)
OPENROUTER_DEFAULT_MODEL=google/gemini-2.5-flash   ← MUST be a model OpenRouter currently serves & that supports vision. NEVER use a `-exp`/`-preview` model as the default: experimental models get pulled and then every validation 404s with "No endpoints found for <model>". Model resolves as: validate node `model` config → tenant `openrouter_default_model` app_setting → this env default.
JWT_SECRET=                    ← optional; falls back to SECRET_KEY if blank
ACCESS_TOKEN_MINUTES=30
REFRESH_TOKEN_DAYS=30
APP_BASE_URL=http://localhost  ← used to build invite links (https://… in prod)
INVITE_EXPIRY_DAYS=7
RESEND_API_KEY=                ← https://resend.com — empty → log-only stub mailer
INVITE_FROM_ADDRESS=noreply@email.genitechs.ca  ← must be on a Resend-verified domain
INVITE_FROM_NAME=Interpret
MAIL_INBOUND_DOMAIN=email.genitechs.ca           ← domain for policy-N@…/workflow-N@… addresses (Resend Inbound)
RESEND_INBOUND_WEBHOOK_SECRET=                    ← Svix signing secret "whsec_…" for /api/mail/resend-inbound; blank = skip verify (DEV ONLY)
MAIL_MAX_ATTACHMENT_BYTES=26214400               ← reject inbound attachments larger than this (default 25 MiB)
```

For local dev outside Docker (running `uvicorn` directly):
```
DATABASE_URL=sqlite:///./data/interpret.db
REDIS_URL=redis://localhost:6379/0
STORAGE_PATH=./data/storage
```

---

## Routing

| Path | Component | Notes |
|---|---|---|
| `/login` | `LoginPage` | Email + password (+ MFA when prompted). Public; everything else is wrapped in `ProtectedRoute`. |
| `/` | `CasesPage` | Cases list (home — v2.1.0+ replaces Dashboard) |
| `/cases` | `CasesPage` | Cases list — operator home; filters: Cases / Needs review / Awaiting applicant / Closed / All |
| `/cases/:caseId` | `CaseDetailPage` | Case detail — 3-column: context + timeline + checklist/docs |
| `/mail` | → `/cases` | Redirects; Mail page dissolved into case timelines |
| `/validate` | `Validate` | Policy-centric run launcher / builder (now under Configure in nav) |
| `/reports/:runId` | `ReportPage` | Full-page durable report (paper layout, exportable to PDF/JSON/CSV) — Phase 5 |
| `/workflows` | `WorkflowList` | All workflows with star/archive controls |
| `/workflows/:id` | `WorkflowEditor` | React Flow canvas |
| `/workflows/:id/runs` | `RunHistory` | Run log |
| `/library` | `LibraryList` | Library — tabbed: Document types + Reference lists (Phase 7) |
| `/library/:id` | `LibraryEditor` | Document type detail |
| `/policies/:id` | `PolicyEditor` | Policy detail |
| `/settings` | `SettingsLayout` (nested) | Sectioned settings; redirects to `/settings/account` |
| `/settings/account` | `AccountSection` | Profile, change password, sign out everywhere |
| `/settings/appearance` | `AppearanceSection` | Theme picker |
| `/settings/language` | `LanguageSection` | Interface language |
| `/settings/ai` | `AiSection` | OpenRouter API key + default model |
| `/insights` | `Insights` | Operational indicators |
| `/admin` | `AdminPage` | Super-admin: tenants, users, integrations |

**Sidebar IA (v2.1.0+):** Two sections: **WORKSPACE** (Cases, Insights) and **CONFIGURE** (Checks/Validate, Workflows, Library, Admin). The old standalone Mail nav item was removed — messages now live inside case timelines. Dashboard's favorited-workflow widgets are not in the nav either; the "New case" button replaces that entry point.

**Important:** The home route `/` now renders `CasesPage` (not Dashboard). Dashboard still exists at its component level but has no dedicated route. WorkflowList is at `/workflows`.

---

## Dashboard & Favorites

The Dashboard (`/`) shows one card widget per favorited, non-archived workflow. Favorites are stored as `is_favorite=true` on the `workflows` table (added via `run_migrations()`).

**Widget lifecycle:**
1. **Idle** — drop zone shown; last run status shown in footer if any runs exist
2. **File selected** — filename + Run button; uploads happen on Run click (not on drop)
3. **Running** — SSE stream opened; step chips update live
4. **Done** — step chips finalize; if `show_results` node completed, results sidebar slides in

**Results sidebar (400px, pushes grid):**
- Opened automatically when `show_results` step reaches `completed`; also has a "View results" button for manual re-open
- Three render modes auto-detected from `output_data`:
  - `overall` key present → validation summary (big status badge + per-rule list)
  - `image_paths` key present → 2-col image grid with lightbox
  - anything else → `<pre>` JSON dump

**Star icon in WorkflowList:**
- Appears as the first column, before the workflow name
- Filled amber when `is_favorite=true`; outline ghost when false
- Calls `POST /api/workflows/{id}/favorite` or `unfavorite`
- Invalidates the `['workflows']` query key on success

---

## Validate Section

The Validate section (`/validate`) is the primary UI for policy validation. It replaces the workflow-editor ceremony for the 90% case: pick a policy, drop a document, run it, see results.

### Design decisions

**Policy-first, not workflow-first.** The user never sees a workflow. Internally, each run uses a **canonical validation pipeline** — a synthetic workflow definition `{nodes: [input, pdf_to_images, validate_documents, show_results], edges: [...]}` assembled on the fly in the API, never persisted as a `Workflow` row. The run is still a normal `WorkflowRun` with steps, SSE streaming, etc.

**Single-policy now, chain-ready later.** The UI currently lets you select one policy at a time. Future policy chaining will appear here as multi-select with an ordering UI; the API will fan the run out into sequential validate_documents steps sharing the same pdf_to_images output.

**Run names are meaningful.** Every run gets `name = original_filename` at creation. Later, a policy can declare an extraction field; the `validate_documents` node will overwrite `name` on the `WorkflowRun` row with the extracted value (e.g. "John Smith — Passport"). The Validate page always shows `name`, never the raw run ID.

### Page layout

```
┌─────────────────────────────────────────────────────┐
│  Left panel (320px)         │  Right panel (flex)   │
│                             │                       │
│  Policy picker              │  Run queue / history  │
│  ─ searchable list          │  ─ newest run on top  │
│  ─ one selected at a time   │  ─ run name = filename│
│  ─ shows rule count + brief │  ─ live step chips    │
│                             │    while running      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ─ click row to open  │
│                             │    results drawer     │
│  Drop zone                  │                       │
│  ─ accepts PDF + images     │                       │
│  ─ shows filename on drop   │                       │
│                             │                       │
│  [Run]                      │                       │
└─────────────────────────────────────────────────────┘
```

**Results drawer** slides in from the right (same renderer as Dashboard sidebar):
- `overall` present → validation summary (big status badge + per-rule list with evidence)
- `image_paths` present → 2-col image grid with lightbox
- otherwise → pretty-printed JSON

### API endpoints

```
POST /api/validate/run          → WorkflowRun   body: {policy_id, document_id?} OR {policy_id, document_ids: [int, ...]}
                                  Accepts either a single document_id (backward compat) or a document_ids list.
                                  Assembles canonical pipeline, fires run, returns run record.
                                  Sets run.name = filename (single) or "N documents" (multi), source = "validate".

GET  /api/validate/runs         → WorkflowRun[] All runs with source="validate".
                                  Optional: ?policy_id=N to filter by policy.
```

All SSE streaming and result access reuse existing endpoints (`/api/runs/{id}/stream`, `/api/files/{path}`).

### DB changes (implemented)

- `workflow_runs.workflow_id` — made nullable (validate runs have no backing Workflow row)
- `workflow_runs.name TEXT` — filename at creation; later: extracted field from policy
- `workflow_runs.source TEXT` — `"validate"` for Validate-section runs; NULL for workflow editor runs
- `workflow_runs.policy_id INTEGER` — policy used; enables filtering in `GET /api/validate/runs`
- `workflow_runs.sender_email TEXT` — set for `source="mail"` runs; `show_results.py` writes an in-app reply `MailMessage` AND (for real, non-`@interpret.local` senders) sends a real Resend reply to this address on completion
- `policies.email_inbox_enabled BOOLEAN NOT NULL DEFAULT 0` — whether this policy has a mailbox active
- `policies.email_address TEXT` — assigned address, e.g. `policy-3@email.genitechs.ca` (`MAIL_INBOUND_DOMAIN`); null when disabled
- `workflows.email_inbox_enabled BOOLEAN NOT NULL DEFAULT 0` — same for workflows
- `workflows.email_address TEXT` — e.g. `workflow-7@email.genitechs.ca`
- `mail_messages.external_id TEXT` — provider message id (Resend `email_id`) for inbound idempotency (migration `0007_mail_external_id`)

### Future: run name extraction

When implemented, the policy will carry an `extraction_field` (e.g. `"patient_name"` or `"invoice_number"`). The `validate_documents` node, after the AI call, will parse that field from the response and call `PATCH /api/runs/{id}` to set `name`. The Validate page will then show "Invoice #12345" instead of "invoice_scan_final_v2.pdf".

### Future: policy chaining

Policy chaining stays in the Validate section. The user picks an ordered list of policies. Under the hood, the canonical pipeline grows: `input → pdf_to_images → validate_documents(policy_A) → validate_documents(policy_B) → show_results`. Each validate step gets its own `WorkflowRunStep`. The results drawer will show a tabbed view, one tab per policy.

---

## Real email (Resend Inbound + replies)

Policy/workflow mailboxes work with **real email**, end to end, via **Resend** for both directions. Single vendor; the `genitechs.ca` apex email (`info@`, on jellyfish.systems) is never touched.

**Inbound flow:**
```
sender → policy-3@email.genitechs.ca
       → Resend Inbound (MX on email.genitechs.ca) parses the message + attachments
       → POST https://interpret.genitechs.ca/api/mail/resend-inbound   {type:"email.received", data:{email_id, from, to[], subject, attachments[]}}
       → webhook (api/app/routers/mail.py):
           1. verify Svix signature (RESEND_INBOUND_WEBHOOK_SECRET)
           2. idempotency: skip if mail_messages.external_id == data.email_id already exists
           3. resolve mailbox: parse policy-{id}/workflow-{id} from a recipient, GLOBAL lookup (no auth), tenant = owner row's tenant_id
           4. GET /emails/receiving/{email_id}/attachments → download each (pre-signed download_url) → save as Document (skips inline parts + >MAIL_MAX_ATTACHMENT_BYTES)
           5. create WorkflowRun(source="mail", policy_id/workflow_id, sender_email=from) + inbound MailMessage(external_id) → trigger_run(docs)
           6. no usable attachment → run marked failed + a "please attach a document" reply is sent
```
The webhook is **unauthenticated by design** (no session behind a webhook); authenticity = the Svix signature, tenant = the matched mailbox's owner. Returns HTTP 200 even for unknown recipients (so Resend stops retrying mail we don't own).

**Outbound replies** (`show_results.py::_send_reply`): on run completion it (a) always writes the in-app `MailMessage` for the `/mail` inbox, and (b) sends a **real Resend email** to `run.sender_email` via `app.mailer.send_email(..., reply_to=<mailbox address>)` so a recipient's reply loops back into the same policy/workflow. Reply gating still respects the policy's `email_reply_mode` (`always`/`on_pass`/`on_fail`/`never`) and `email_pass_message`/`email_fail_message` templates (`{{failed_rules}}` placeholder). Senders ending in `@interpret.local` (the UI compose fixture) get the in-app copy only — no real send.

**One-time setup.** Receiving was enabled on the Resend domain `email.genitechs.ca` via API (`PATCH /domains/{id} {"receiving":true}` → `capabilities.receiving:"enabled"`; it added the inbound MX `inbound-smtp.us-east-1.amazonaws.com` priority 10). What remains is done **without touching the server `.env`** — config is now UI-managed (Admin → Integrations):
1. **Cloudflare DNS** → on `email.genitechs.ca` add the inbound **MX** record `inbound-smtp.us-east-1.amazonaws.com` priority **10** (its root has no MX, so no conflict with the apex or with `send.email.genitechs.ca`). Wait for verify.
2. App → **Admin → Integrations** → copy the **Webhook URL** shown there (it's `{APP_BASE_URL}/api/mail/resend-inbound`, so it's always correct for the current deployment).
3. Resend → Webhooks → **add endpoint** = that URL, event **`email.received`** → copy the signing secret (`whsec_…`).
4. Paste the secret into **Admin → Integrations → Inbound webhook secret** and Save. No `.env` edit or redeploy needed. (`RESEND_INBOUND_WEBHOOK_SECRET` env still works as a fallback.)

**Gotchas:**
- The webhook `email.received` payload carries attachment **metadata only** — bytes are fetched via the Attachments API's pre-signed `download_url`. Needs `RESEND_API_KEY` set (the same key used for sending).
- Idempotency is keyed on Resend's `email_id` stored in `mail_messages.external_id` (migration `0007`). Resend retries on non-2xx, so always return 200 on terminal outcomes.
- Inbound addresses are resolved **globally** (the embedded id is a global PK); the tenant comes from the matched row — never from a session.
- Attachment size is capped by `MAIL_MAX_ATTACHMENT_BYTES` (default 25 MiB), checked against both the reported `size` and the downloaded bytes.
- **Inline attachments are kept.** Apple Mail (and others) mark PDFs/docs as `content_disposition: "inline"`. `_save_attachment_as_document` keeps real documents regardless of disposition and only drops (a) parts with no filename and (b) *small inline images* (`< _INLINE_IMAGE_LOGO_MAX` = 50 KB) — the signature-logo case. Do NOT reintroduce a blanket "skip inline" rule; it silently drops legitimate emailed PDFs.

---

## Known Gotchas

- **Port 6379 conflict**: If you have a local Redis running, the docker-compose redis service has no host port mapping — that's intentional. Containers communicate via the `redis` hostname internally.
- **413 on uploads**: nginx defaults to 1MB. The `nginx.conf` sets `client_max_body_size 100M`. If you hit this, check the nginx config.
- **SSE buffering**: nginx must have `proxy_buffering off` for the `/api/runs/*/stream` endpoint or SSE events batch up. Already set in `nginx.conf`.
- **FK crash in worker**: If you add a new ORM model with FK references to another model, you must import the referenced model in `celery_app.py`. SQLAlchemy resolves FK targets lazily at first access; if a model is never imported in the worker process, it can't resolve the FK.
- **React Flow CSS artifacts**: See the CSS section above. Every new node type needs its class added to `index.css`.
- **Celery chain first arg**: Do NOT add the first positional arg for task 2+ in a chain. Celery injects the previous return value automatically. Passing it again causes mismatched args.
- **validate_documents passthrough**: The `validate_documents` node passes `image_paths` and `document_id` through in its output_data so downstream `output` nodes can still access the images even after validation.
- **OpenRouter key empty by default**: The `.env` ships with `OPENROUTER_API_KEY=` empty. Runs with a `validate_documents` node will fail with a clear error ("OpenRouter API key not configured…") until the key is set in Settings or `.env`.
- **validate_documents direct file input**: When there are no `image_paths` in `input_data` (i.e. connected directly to the ingest node, not through pdf_to_images), the task checks `file_path`. PDFs are converted inline via pymupdf; images (png/jpg/jpeg/webp/gif) are encoded directly. The `file_path` may be absolute or relative to `STORAGE_PATH`.
- **Celery worker does not auto-reload**: The API source (`api/app/`) is a volume mount, so uvicorn picks up Python changes automatically. The Celery worker does NOT — it imports task modules at startup and holds them in memory. After editing any task file (`nodes/*.py`, `executor.py`, etc.), you must `docker compose restart worker` to pick up the changes.
- **validate_documents + fail_on_missing**: `fail_on_missing` defaults to `False` — the run continues even if required rules fail. When `fail_on_missing=True` and a required rule fails, the step is marked `completed` (so its output is visible) but the *run* is marked `failed`. The step output with validation details is still accessible for debugging.
- **ValidateDocumentsNode is the focal node**: It is 260px wide (vs 200px for other nodes), has a violet border visible even when unselected, and displays the policy's rule list directly on the canvas. During a run, all rules pulse indigo together ("checking"); after the step completes they resolve to pass/fail/uncertain icons. The same live status appears in the NodeConfigPanel config section with full evidence text. The node fetches its policy rules via `usePolicy(policy_id)` and tracks the active run via `useRunContext().activeRunId` + `useRun(activeRunId)` — both poll/share TanStack Query cache without extra SSE connections.
- **Runs must never get stuck in `pending`**: `trigger_run` (executor.py) calls `_fail_run` and returns a failed run — instead of returning silently — when the workflow has no nodes, contains a cycle (topological sort yields fewer nodes than input), or references an unknown node type. Likewise `mail.inbound` fails the run when no document is attached (a validation needs at least one document). If you add a new run-creation path, ensure every path either enqueues a chain or fails the run; a silent early-return leaves an orphaned `pending` run forever.
- **Unreadable documents must not false-pass**: `validate_documents` multi-doc mode raises (failing the run) when *no* document in the set yields any readable content (`text_content` or `image_paths`) — e.g. all files are empty/corrupt/unsupported. Without this guard the per-doc merge produces 0 results, which computes to a vacuous `overall="pass"`. Single-doc mode already raised in this case; the guard makes multi-doc consistent.
- **Dangling edges must not strand a run in `pending`**: `_topological_sort` (executor.py) skips edges whose `source` or `target` is not a node in the graph. A definition with an edge pointing to a deleted/nonexistent node (corrupt or partially-edited workflow) would otherwise `KeyError` inside `trigger_run` *after* the run row was committed — leaving an orphaned `pending` run forever and 500-ing the create-run request. The cycle check still runs after the dangling edges are dropped.
- **Password reset tokens are bcrypt-hashed** (same pattern as refresh tokens). The raw token only ever appears in the reset email and the URL. `_find_valid_reset_token` scans the unexpired, unconsumed rows — same O(n) linear scan as `verify_and_consume_refresh_token`; stays small in practice because old tokens are invalidated on each new request.
- **TOTP secret encryption key is derived from `SECRET_KEY`** (`api/app/totp.py`): `Fernet(base64.urlsafe_b64encode(sha256(SECRET_KEY).digest()))`. If `SECRET_KEY` changes in production, all existing TOTP credentials become unreadable — users will need to re-enroll. Keep `SECRET_KEY` stable.
- **Per-tenant settings: `db.get(AppSetting, key)` is wrong now.** `AppSetting` has composite PK `(tenant_id, key)`, so tenant-aware callers (the routers) read via `db.get(AppSetting, (tenant_id, key))`. Celery node tasks (`validate_documents`, `ai`) look up the run's `tenant_id` first and use the composite key — without this they'd see an empty OpenRouter key.
- **Celery worker imports `app.models.auth`** in `celery_app.py` (per the documented FK-resolution rule). Forgetting it would crash any task whose ORM touches a tenant FK.
- **Migrations run in the container entrypoint, not FastAPI startup.** uvicorn `--reload` was re-entering `run_migrations` mid-flight and deadlocking SQLite; the move to `entrypoint.sh` → `python -m app.migrate_cli` → `exec uvicorn` made this go away. Worker shares the entrypoint but won't actually do work because alembic_version is already at head by the time it starts (it `depends_on: api healthy`).
- **bcrypt 4.x vs passlib.** Passlib's bcrypt backend mis-detects the new bcrypt's version string and raises a misleading "password cannot be longer than 72 bytes" even on a 12-byte password. We call `bcrypt.hashpw` / `bcrypt.checkpw` directly (`app/security.py`), pre-truncating to 72 bytes ourselves. Do not reintroduce passlib without pinning a compatible bcrypt.
- **Cross-set result rows must carry the DB `requirement`, not the AI's**: in `validate_documents`, per-document (`merged`) rows already set `requirement` from the authoritative `PolicyRule.requirement`, but cross-set rows must do the same (the model tends to leak free text into that field). `review.py._compute_overall` reads `requirement` from the stored result row and treats anything not literally `"optional"` as required — so an **optional** cross-set rule whose AI free-text leaked into `requirement` would wrongly flip the effective verdict to `fail` the moment a reviewer touches the report. Fixed by overwriting `r["requirement"]` with the DB value when building cross-set result rows.

---

## Theming System

The app supports **light / dark / system** modes. The active mode is saved to `localStorage` under the key `theme`. ThemeProvider in `frontend/src/context/theme.tsx` applies/removes the `dark` class on `<html>` and listens to OS changes when in system mode.

All colors are CSS custom properties defined in `frontend/src/index.css`:
- `:root` defines the **light** values
- `.dark` overrides with **dark** values

**Never write hardcoded hex colors in components.** Always use the CSS variable via Tailwind's arbitrary value syntax:

```
bg-[var(--c-bg)]        border-[var(--c-border)]     text-[var(--c-text-1)]
bg-[var(--c-surface)]   border-[var(--c-border-2)]   text-[var(--c-text-2)]
bg-[var(--c-surface-2)] border-[var(--c-border-3)]   text-[var(--c-text-3)]
bg-[var(--c-surface-3)] divide-[var(--c-divider)]    text-[var(--c-text-4)]
                                                      text-[var(--c-text-5)]
hover:bg-[var(--c-hover-1)]                           text-[var(--c-text-6)]
hover:bg-[var(--c-hover-2)]
hover:bg-[var(--c-hover-3)]
bg-[var(--c-active)]   ← selected/active nav items
```

React Flow props use variables directly in style objects:
```tsx
style={{ background: 'var(--c-bg)' }}
maskColor="var(--c-rf-mask)"
color="var(--c-rf-dot)"   // Background dots
```

---

## Internationalization (i18n) — English + Quebec French

The entire UI is bilingual. Language is **English (`en`)** or **Quebec French (`fr`)**, toggled in **Settings → Language** (mirrors the theme picker). The choice persists to `localStorage` under key `lang`; first visit defaults to `fr` if `navigator.language` starts with `fr`, else `en`. The active lang sets `<html lang="en|fr-CA">`.

**Architecture (mirrors `context/theme.tsx`):**
- `frontend/src/context/i18n.tsx` — `I18nProvider` + `useI18n()` → `{ lang, setLang, t }`. `t(key, vars?)` looks up a flat namespaced key and interpolates `{var}` placeholders. Falls back to the `en` value, then the raw key. Wired into `App.tsx` wrapping everything (inside `ThemeProvider`).
- `frontend/src/lib/i18n/dictionary.ts` — aggregates **every** `frontend/src/lib/i18n/strings/*.ts` via Vite `import.meta.glob({ eager: true })`. **Adding a namespace requires NO edit here** — drop a new file in `strings/` and it's picked up. (Requires `src/vite-env.d.ts` with `/// <reference types="vite/client" />` for the glob types.)
- `frontend/src/lib/i18n/strings/*.ts` — one file per namespace, each exporting two flat objects `en` and `fr` with **namespaced keys** (e.g. `'validate.title'`) so merges never collide. Namespaces: `common` (nav, buttons, statuses, verdicts — REUSE these), `settings`, `dashboard`, `validate`, `mail`, `workflows`, `editor`, `nodeconfig`, `runstatus`, `library`, `policy`, `report`.

**Conventions:**
- In a component: `const { t } = useI18n()`, then `t('ns.key')` for every user-visible string. Each sub-component defined in a file needs its own `const { t } = useI18n()`.
- Reuse `common.*` for generic buttons/statuses/verdicts instead of duplicating. Map API status/verdict VALUES (`'pass'`, `'fail'`, `'running'`, …) to labels via `common.verdict.*` / `common.status.*` — never translate the values themselves.
- **Never translate dynamic/DB/AI data**: policy names, briefs, rule names, accept/fail criteria, document filenames, AI evidence/extracted text, model IDs, email addresses, message subjects/bodies, log lines. Only translate static UI chrome.
- Quebec French specifics: **Courriel** (not e-mail/Mail), **Téléverser** (upload), **Flux de travail** (workflows), **Vérifications** (Checks), guillemets/accents and `’` typographic apostrophes. Dates localize via `fr-CA`.
- **Non-component modules can't call `useI18n()`**: `lib/reportExport.ts` takes the translator `t` (and `lang`) as function params; callers (`ReportPage`, `Validate`'s `RunDetailModal`) pass them. `ReportView` is rendered both in-app (uses context `t`) and via `renderToStaticMarkup` for PDF export (uses `t`/`lang` passed as props), so PDF and on-screen output match.
- A new strings module's keys are merged by object key, so **a stray TS type annotation like `const x: Record<string,string> = {...}[k]`** (where the result is actually a `string`) will fail the build — assign the map to a variable first, then index it.

---

## Design Language

The UI is intentionally minimal and commercial — think Linear, Vercel dashboard, Raycast. No gradients, no decorative shadows, no colored backgrounds, no multiple accent colors competing. Every element earns its place.

### Color Tokens (dark → light)

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--c-bg` | #0a0a0a | #f5f5f5 | Page background |
| `--c-surface` | #111 | #ffffff | Cards, panels, modals |
| `--c-surface-2` | #0d0d0d | #f8f8f8 | Alternate surface |
| `--c-surface-3` | #1a1a1a | #f0f0f0 | Badges, hover states |
| `--c-border` | #1a1a1a | #e8e8e8 | Primary borders |
| `--c-border-2` | #222 | #d4d4d4 | Node/input borders |
| `--c-border-3` | #2a2a2a | #bbbbbb | Hover borders |
| `--c-divider` | #141414 | #eeeeee | List dividers |
| `--c-text-1` | #e8e8e8 | #111 | Primary text |
| `--c-text-2` | #aaa | #555 | Secondary text |
| `--c-text-3` | #888 | #777 | Muted text |
| `--c-text-4` | #666 | #999 | Subtle text |
| `--c-text-5` | #444 | #aaa | Faint text |
| `--c-text-6` | #2a2a2a | #bbb | Ghost text |
| `--c-hover-1` | rgba(255,255,255,0.02) | rgba(0,0,0,0.03) | Hover bg light |
| `--c-hover-2` | rgba(255,255,255,0.03) | rgba(0,0,0,0.04) | Hover bg medium |
| `--c-hover-3` | rgba(255,255,255,0.04) | rgba(0,0,0,0.05) | Hover bg strong |
| `--c-active` | rgba(255,255,255,0.06) | rgba(0,0,0,0.07) | Active/selected bg |

### Semantic Colors (status only, never decorative)

```
emerald-400   completed / success / output nodes
amber-400     unsaved indicator / transform nodes / warnings
red-400       failed / errors
indigo-400    running / loading / input nodes
indigo-600    buttons, active states (only interactive accent)
```

### Typography

- Font: Inter / system-ui (set in `index.css`)
- Base: 14px html root; component sizes via `text-[Npx]` — never Tailwind named sizes
- No bold except headings and button labels; use color contrast instead

### Spacing & Shape

- Border radius: `rounded-lg` (8px) for cards/modals, `rounded-md` (6px) for inputs/buttons, `rounded` (4px) for tags
- Node width: 200px fixed
- Sidebar width: 220px
- Top bar height: 52px (`h-[52px]`)
- Dividers: `divide-[var(--c-divider)]` for lists, `border-[var(--c-border)]` for structural

### Component Patterns

**Buttons**
```
Primary:   bg-indigo-600 text-white px-3 h-7 text-[12px] font-medium rounded hover:bg-indigo-500
Secondary: border border-[var(--c-border-2)] text-[var(--c-text-3)] px-3 h-7 rounded hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]
Ghost:     text-[var(--c-text-4)] px-2.5 py-1.5 rounded hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]
Danger:    hover:text-red-400 hover:bg-red-500/10
```

**Inputs**
```
border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)]
placeholder-[var(--c-text-5)] rounded outline-none
focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20
```

**Cards / Nodes**
```
bg-[var(--c-surface)] border border-[var(--c-border-2)] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.5)]
hover:  border-[var(--c-border-3)]
selected: border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]
```

**Modals**
```
bg-[var(--c-surface)] border border-[var(--c-border-2)] rounded-xl shadow-2xl
Backdrop: bg-black/60 backdrop-blur-sm
```

**Tables / Lists**
- Table layout (not cards) for list pages
- `divide-y divide-[var(--c-divider)]` between rows
- Header row: `text-[11px] font-medium text-[var(--c-text-5)]`
- Row hover: `hover:bg-[var(--c-hover-1)]`

**Left Sidebar**
```
w-[220px] bg-[var(--c-bg)] border-r border-[var(--c-border)]
Active item: bg-[var(--c-active)] text-[var(--c-text-1)] rounded-md
Inactive:    text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-2)]
Section label: text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]
```

**Node Icon Squares**
```
h-[22px] w-[22px] rounded-[5px]
input:           bg-indigo-500/15  + text-indigo-400
pdf_to_images:   bg-amber-500/15   + text-amber-400
output:          bg-emerald-500/15 + text-emerald-400
validate_documents / show_results: bg-violet-500/15 + text-violet-400
```

### What Not to Do

- No gradients (`bg-gradient-*`)
- No colored backgrounds on page sections
- No multiple accent colors — indigo is the only interactive accent
- No emoji in production UI
- No glassmorphism / frosted glass effects
- No borders with opacity > 0.15 unless it's an active/selected state
- No `rounded-full` on anything except handle dots and status dots
- **No hardcoded hex colors in components** — always use `var(--c-xxx)` CSS variables
