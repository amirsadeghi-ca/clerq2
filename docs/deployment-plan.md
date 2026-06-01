# Interpret — Production Deployment Plan (nas + Cloudflare + real email)

> Status: **awaiting go-ahead on Phase 1**. Single source of truth for the deploy work. Update as phases complete.

## Goal

Deploy Interpret to the home server `nas`, exposed publicly via a **named Cloudflare Tunnel**, with **real email** working end-to-end (receive an email with a PDF → run a validation → email the report back), and **auto-deploy on push to `main`**. Remove the fake mail test scaffolding.

## Decisions (locked with the user)

| Topic | Decision |
|---|---|
| Domain | **arbab-soft.com** (already a Cloudflare zone). App at **`app.arbab-soft.com`**; inbound email **`*@arbab-soft.com`**; outbound from **`send.arbab-soft.com`**. Existing root website/A-record left untouched; enabling Email Routing replaces the (unimportant) cPanel inbound MX. |
| Inbound email | **Cloudflare Email Routing + Email Worker** (postal-mime → multipart POST to `/api/mail/inbound`). ≤25 MiB messages (~18 MB practical PDF). |
| Outbound email | **Resend** (3,000/mo free, 40 MB), sending from `send.arbab-soft.com` (coexists with CF root MX). |
| CI/CD | **Private GitHub repo under @amirhetc** + **self-hosted Actions runner** on `nas`, `on: push: main`. Cron poller as documented fallback. |
| Commit scope | **Whole app working tree** to `main`, secrets/data gitignored — but I show the exact file list before the first push. |
| Deploy target | `nas` (192.168.2.63, user `amix`). 2-core/4-thread i5, 7.7 GB RAM. Tight but workable; use container mem limits. |

## Target architecture

```
Browser ─https─► app.arbab-soft.com ─► cloudflared (container) ─► frontend:80 ─► api:8000 ─► worker ─► OpenRouter
                                          (named tunnel, token)        nginx          redis (internal only)
Sender ─email─► *@arbab-soft.com (MX→Cloudflare) ─► CF Email Routing ─► Email Worker (postal-mime)
                                                       └─ multipart POST (file + X-Webhook-Secret) ─► /api/mail/inbound
Report  ◄─email─ Resend (from reports@send.arbab-soft.com) ◄─ show_results node (real send)
Dev ─push main─► GitHub (private, @amirhetc) ─► self-hosted runner on nas ─► deploy.sh (reset --hard + compose build + up)
```

## Division of labor

**I do:** all code changes; the Cloudflare Email Worker source; install Docker + deploy on `nas`; production `docker-compose.prod.yml` (cloudflared + mem limits); `deploy.sh`; self-hosted runner + `deploy.yml`; SSE heartbeat fix; end-to-end verification.

**You do (account actions I can't):**
1. **GitHub** — create an empty **private** repo under @amirhetc (or grant me access) and give me the URL + a runner registration token (Settings → Actions → Runners → New self-hosted runner).
2. **Cloudflare (arbab-soft.com zone)** — create the named tunnel and give me the **tunnel token**; enable **Email Routing**; set **catch-all → the worker**; deploy the worker via `npx wrangler deploy` (browser login) **or** give me a scoped **Cloudflare API token** so I do it. Add the DNS records I'll specify (or I add them with the API token).
3. **Resend** — create account, add domain `send.arbab-soft.com`, add the DKIM/SPF DNS records it shows (I'll relay), give me the **RESEND_API_KEY**.

*(If you'd rather I do the Cloudflare/Resend dashboard/DNS steps, hand me a scoped Cloudflare API token + the Resend key and I'll drive them.)*

## Inputs checklist (what I need from you to finish)
- [ ] GitHub private repo URL (@amirhetc) + self-hosted runner registration token
- [ ] Cloudflare Tunnel token (for `app.arbab-soft.com` → frontend)
- [ ] Cloudflare API token *(optional — only if you want me to do Email Routing + DNS)*
- [ ] Resend API key + confirmation `send.arbab-soft.com` is verified
- [ ] Confirm: the existing **root website** at arbab-soft.com — keep it (default) or repoint root to the app?

---

## Phases (approval-gated)

### Phase 1 — Baseline, repo, server prep
**Objective:** a shared remote with the current work committed, and Docker on `nas`.
- Show you the exact file list that will be committed; commit the working tree to `main` (secrets/data gitignored; verify `.env`, `data/`, `node_modules/`, big binaries are excluded; the loose root PDFs and `.DS_Store` get ignored too).
- Add GitHub remote (@amirhetc private repo); push `main`.
- On `nas`: install Docker Engine + compose plugin (needs sudo pw — I have it); add `amix` to the `docker` group; clone the repo to `/srv/clerq2` (or `~/clerq2`).
- **Verify:** `docker run hello-world` works as `amix`; repo cloned at the target commit.

### Phase 2 — Real email backend (generalized, not arbab-specific)
**Objective:** the app can receive multipart email and send real replies; domain configurable.
- `/api/mail/inbound`: accept **multipart/form-data** (`to`, `from_email`, `subject`, `body`, `file`/`files`) in addition to (or replacing) the JSON shape; upload the attachment to a Document internally; verify a shared **`MAIL_WEBHOOK_SECRET`** header.
- Add config to `api/app/config.py`: `mail_domain` (default `interpret.local`), `mail_webhook_secret`, `resend_api_key`, `mail_from_address` (e.g. `reports@send.arbab-soft.com`), `public_base_url`. Replace the 4 hardcoded `interpret.local` usages with `settings.mail_domain`.
- Implement **real sending** via Resend in `show_results.py` (`_send_reply`) and `send_email.py` — keep writing the MailMessage row *and* send; respect existing `email_reply_mode`/pass/fail messages; attach the report PDF if feasible.
- Remove frontend test scaffolding: the compose panel + `useSendMail` in `MailInbox.tsx`/`mail.ts`; keep the inbox list, polling, mailboxes. Update i18n strings.
- Add `resend` to `api/pyproject.toml`.
- **Verify (local, before deploy):** `curl` a multipart POST with a PDF to `/api/mail/inbound` (with the secret) → run triggers, document attached; outbound path sends via Resend test (or dry-run if key not yet set).

### Phase 3 — Cloudflare Email Worker
**Objective:** real inbound mail reaches the app.
- Create `mail-worker/` in the repo: `wrangler.jsonc` (`nodejs_compat`), `src/index.ts` with the `email()` handler — parse with **postal-mime**, extract attachment, `fetch()` multipart POST to `https://app.arbab-soft.com/api/mail/inbound` with `X-Webhook-Secret`.
- You (or I, with API token): `npx wrangler deploy`; enable Email Routing; catch-all → this worker.
- **Verify:** `wrangler` local handler test + a real send to `policy-N@arbab-soft.com`.

### Phase 4 — Production deploy
**Objective:** the app is live at `app.arbab-soft.com`.
- `docker-compose.prod.yml`: redis (internal), api, worker, frontend, **cloudflared** (token from `.env`); **mem limits** (e.g. frontend build off-box or limited; api/worker capped); no source bind-mounts; `restart: unless-stopped`.
- SSE hardening: ensure `/api/runs/{id}/stream` sets `Content-Type: text/event-stream` and emits a **heartbeat every ~20 s** (beats CF's 100 s idle timeout); keep nginx `proxy_buffering off`.
- `.env` on server (OpenRouter key, secret, tunnel token, Resend key, webhook secret, mail domain).
- First `docker compose -f docker-compose.prod.yml up -d --build`.
- **Verify:** `https://app.arbab-soft.com/api/health` = 200 from the public internet; upload a PDF in the UI; watch a live run stream; results render.

### Phase 5 — CI/CD
**Objective:** push to `main` auto-deploys.
- `deploy.sh` (git reset --hard origin/main + compose build + up -d --force-recreate).
- Install GitHub self-hosted runner on `nas` as a systemd service (outbound-only); `.github/workflows/deploy.yml` (`on: push: main`, `runs-on: [self-hosted]`, concurrency-guarded).
- **Verify:** trivial commit to `main` → runner deploys within seconds → change visible at `app.arbab-soft.com`.

### Phase 6 — End-to-end acceptance
- Send a real email with a PDF to a policy mailbox → run executes → **a real report email arrives back** from `send.arbab-soft.com`.
- Confirm uploads near the 100 MB cap behave (and document the limit); confirm SSE stays alive past 100 s.
- Update `CLAUDE.md` (prod compose, new env vars, mail-worker, configurable domain, removed scaffolding).

## Risks / cautions
- **Upload size:** Cloudflare Free hard-caps request bodies at **100 MB**; keep uploads under it (email path is capped at 25 MiB anyway).
- **Server is tight/busy** (Psiphon/Plex/torrents): mitigate with container mem limits; consider building the frontend image off-box if deploys thrash.
- **Email Routing replaces root MX** → cPanel inbound mail for arbab-soft.com stops (accepted).
- **Secrets** never committed: tunnel token, Resend key, webhook secret, OpenRouter key live only in server `.env` / GitHub Actions secrets / Cloudflare worker vars.

## Rollback
- App: `git reset --hard <prev>` + redeploy (versions retained in GitHub).
- Email: disable the catch-all route / Email Routing in Cloudflare to stop inbound; remove Resend key to stop outbound.
- Tunnel: stop the cloudflared container.
