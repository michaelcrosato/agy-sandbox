# Security Policy

## Supported versions

This is an actively-developed project; only the latest `main` (and the current
`develop`) is supported. Fixes land on `develop` and are merged to `main`.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Report privately through GitHub's **Security → Report a vulnerability** on this
repository (Private Vulnerability Reporting). Include:

- affected file(s)/endpoint(s) and a clear description of the impact,
- steps to reproduce (a minimal proof of concept if possible),
- any suggested remediation.

You can expect an acknowledgement within a few days. Please allow reasonable time
for a fix before any public disclosure.

## Scope and deployment notes

This project ships an authoritative game server plus a local guest-runner sandbox
for untrusted automation. Two points matter when deploying publicly (both are
documented in [`README.md`](README.md#security) and [`plan/BACKLOG.md`](plan/BACKLOG.md)):

- The admin/sandbox HTTP API (`/api/sandbox/*`, `/api/firewall/rules`) is gated
  to loopback callers or an `ADMIN_TOKEN`; never expose it unauthenticated.
- `/metrics` is an unauthenticated read by design (the dashboards consume it);
  firewall it if the telemetry is sensitive.

The guest-runner sandbox is defense-in-depth, not a hard security boundary — only
grant it to trusted operators.
