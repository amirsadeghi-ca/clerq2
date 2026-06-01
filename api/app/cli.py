"""Admin CLI — tenants and users are admin-provisioned (no public signup).

Usage (inside the api container, or in a local dev shell):
    docker compose exec api python -m app.cli list-tenants
    docker compose exec api python -m app.cli create-tenant "Acme Inc" --slug acme
    docker compose exec api python -m app.cli create-user --tenant acme --email amir@acme.co --password 'first-pass' --role owner
    docker compose exec api python -m app.cli set-password --email amir@acme.co --password 'new-pass'
    docker compose exec api python -m app.cli list-users [--tenant acme]
    docker compose exec api python -m app.cli deactivate-user --email amir@acme.co

The `create-user` command auto-creates the matching `AuthIdentity` row of
provider="password". Re-running `create-user` for an existing email is rejected;
use `set-password` to rotate credentials.
"""
from __future__ import annotations

import argparse
import re
import sys
from getpass import getpass

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.auth import AuthIdentity, Tenant, User
from app.security import hash_password


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", s.strip().lower()).strip("-") or "tenant"


def _ask_password(provided: str | None) -> str:
    if provided:
        return provided
    p1 = getpass("Password: ")
    p2 = getpass("Confirm: ")
    if p1 != p2:
        print("Passwords do not match.", file=sys.stderr)
        sys.exit(2)
    if len(p1) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(2)
    return p1


def _resolve_tenant(db: Session, slug_or_id: str) -> Tenant:
    t: Tenant | None = None
    if slug_or_id.isdigit():
        t = db.get(Tenant, int(slug_or_id))
    if t is None:
        t = db.query(Tenant).filter(Tenant.slug == slug_or_id.lower()).first()
    if t is None:
        print(f"Tenant '{slug_or_id}' not found.", file=sys.stderr)
        sys.exit(1)
    return t


def cmd_list_tenants(args, db: Session) -> None:
    for t in db.query(Tenant).order_by(Tenant.id).all():
        print(f"  {t.id:>4}  {t.slug:<20}  {t.name}  ({'active' if t.is_active else 'inactive'})")


def cmd_create_tenant(args, db: Session) -> None:
    slug = (args.slug or _slugify(args.name)).lower()
    if db.query(Tenant).filter(Tenant.slug == slug).first():
        print(f"Tenant slug '{slug}' already exists.", file=sys.stderr)
        sys.exit(1)
    t = Tenant(name=args.name, slug=slug, is_active=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    print(f"Created tenant #{t.id}  slug={t.slug}  name={t.name}")


def cmd_create_user(args, db: Session) -> None:
    tenant = _resolve_tenant(db, args.tenant)
    email = args.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        print(f"A user with email '{email}' already exists.", file=sys.stderr)
        sys.exit(1)
    password = _ask_password(args.password)
    user = User(
        tenant_id=tenant.id,
        email=email,
        display_name=args.display_name or email.split("@")[0],
        role=(args.role or "member").lower(),
        is_active=True,
        mfa_required=False,
    )
    db.add(user)
    db.flush()
    db.add(AuthIdentity(
        user_id=user.id,
        provider="password",
        secret=hash_password(password),
        is_verified=True,
    ))
    db.commit()
    print(f"Created user #{user.id}  tenant={tenant.slug}  email={user.email}  role={user.role}")


def cmd_set_password(args, db: Session) -> None:
    email = args.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        print(f"User '{email}' not found.", file=sys.stderr)
        sys.exit(1)
    password = _ask_password(args.password)
    ident = next((i for i in user.identities if i.provider == "password"), None)
    if ident is None:
        ident = AuthIdentity(user_id=user.id, provider="password", is_verified=True)
        db.add(ident)
    ident.secret = hash_password(password)
    db.commit()
    print(f"Password updated for {user.email}.")


def cmd_list_users(args, db: Session) -> None:
    q = db.query(User).order_by(User.id)
    if args.tenant:
        tenant = _resolve_tenant(db, args.tenant)
        q = q.filter(User.tenant_id == tenant.id)
    for u in q.all():
        tenant = db.get(Tenant, u.tenant_id)
        status = "active" if u.is_active else "inactive"
        print(f"  {u.id:>4}  {u.email:<32}  role={u.role:<8}  tenant={tenant.slug if tenant else '?'}  ({status})")


def cmd_deactivate_user(args, db: Session) -> None:
    email = args.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        print(f"User '{email}' not found.", file=sys.stderr)
        sys.exit(1)
    user.is_active = False
    db.commit()
    print(f"Deactivated {user.email}.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Interpret admin CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-tenants").set_defaults(func=cmd_list_tenants)

    p = sub.add_parser("create-tenant")
    p.add_argument("name")
    p.add_argument("--slug")
    p.set_defaults(func=cmd_create_tenant)

    p = sub.add_parser("create-user")
    p.add_argument("--tenant", required=True, help="tenant slug or id")
    p.add_argument("--email", required=True)
    p.add_argument("--password", help="omit to be prompted")
    p.add_argument("--display-name")
    p.add_argument("--role", default="member", choices=["owner", "admin", "member"])
    p.set_defaults(func=cmd_create_user)

    p = sub.add_parser("set-password")
    p.add_argument("--email", required=True)
    p.add_argument("--password", help="omit to be prompted")
    p.set_defaults(func=cmd_set_password)

    p = sub.add_parser("list-users")
    p.add_argument("--tenant", help="tenant slug or id")
    p.set_defaults(func=cmd_list_users)

    p = sub.add_parser("deactivate-user")
    p.add_argument("--email", required=True)
    p.set_defaults(func=cmd_deactivate_user)

    args = parser.parse_args(argv)
    with SessionLocal() as db:
        args.func(args, db)


if __name__ == "__main__":
    main()
