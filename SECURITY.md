# Security policy

## Supported versions

There are no tagged releases. `main` is the only supported branch: a fix
lands there and nowhere else, and a report against anything older is checked
against `main` first.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting:
open the repository's Security tab, choose "Report a vulnerability", and say
what you found, how to reproduce it and what it lets someone do. The report
is visible only to the maintainer until a fix is published, and the
conversation stays inside that draft advisory.

Expect an acknowledgement within a few days. If the report is confirmed you
will hear when the fix is on `main`, and you can be credited in the advisory
if you want to be.

## Credentials

Credentials, meaning the database password, the mail password and any API
key, live only in `.env` files, which are gitignored; the tracked
`.env.example` files hold placeholders. Nothing in `frontend/.env` is secret
by design, since every `VITE_` variable ships in the bundle. Any credential
that reaches a commit, on any branch, is treated as compromised and rotated,
whether or not the commit is later rewritten or the branch deleted. A value
that looks like a real credential anywhere in the tracked files is a bug;
report it the same way.
