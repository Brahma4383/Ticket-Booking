# Contributing

How a change gets into SuryaBooker. The [README](README.md) explains what the
project is and how to run it; this file is about the path from a branch to
`main`.

## Before you start

Clone the repository:

```bash
git clone https://github.com/Brahma4383/Ticket-Booking.git
cd Ticket-Booking
```

Then set up both halves. The commands are in the README under "Running it";
in short:

- Backend: create a virtualenv at `backend/myvenv`, install
  `backend/requirements.txt` into it, and copy `backend/.env.example` to
  `backend/.env`. A MySQL 8.0 server with `schema.sql` applied is needed to
  run the site, not to run the tests.
- Frontend: `cd frontend && npm install`, then copy `.env.example` to `.env`.
  The package manager is npm; `package-lock.json` is the only lockfile.

Before pushing, these must pass locally. CI runs the same three, so a push
that fails them here fails there too:

```bash
# from backend/, with the virtualenv activated
python manage.py test --settings=config.test_settings
```

```bash
# from frontend/
npm run lint
npm run build
```

The tests run against SQLite in memory and need no MySQL server. Lint may
print warnings; it fails only on errors.

## Branching

`main` is protected. Nothing is committed to it directly, however small;
every change arrives through a pull request from a short-lived branch, and
the branch is deleted once it is merged.

Branch from an up-to-date `main`:

```bash
git checkout main
git pull
git checkout -b fix/hotel-checkout-date
```

Names are `type/short-kebab-description`, where `type` is one of `feat`,
`fix`, `chore`, `docs`, `refactor`, `test`, `ci` or `schema`. `schema` is for
changes to `schema.sql`. One topic per branch: a bug fix and an unrelated
rename are two branches and two pull requests, even when they are found on
the same afternoon.

## Commits

Messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): summary
```

`type` is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test` or `ci`.
`scope` is one of `backend`, `frontend`, `schema`, `ci`, `docs`, `deps`, or
the name of the app the change lives in, such as `bus` or `accounts`. The
summary is in the imperative, has no trailing full stop, and the whole first
line stays under 72 characters.

```
feat(bus): return stop points in the trip search response
fix(hotel): reject a check-out date on or before check-in
feat(schema): add cancelled_at to booking
chore(deps): bump djangorestframework from 3.18.0 to 3.18.1
chore(ci): cache pip downloads in the backend job
```

The body is for why, when why is not obvious from the diff: what was wrong,
what else was tried, what a reader six months from now needs to know before
undoing it. A one-line change with an obvious reason needs no body. Close an
issue from the footer with `Closes #12`.

## Pull requests

- Open the pull request against `main`. The template in
  `.github/PULL_REQUEST_TEMPLATE.md` is loaded into the description; fill it
  in rather than deleting it.
- CI must be green. The `backend` and `frontend` jobs in
  `.github/workflows/ci.yml` are required status checks, so a red job blocks
  the merge button.
- Read your own diff on GitHub first, the way a reviewer would. Stray debug
  output, unrelated formatting changes and a forgotten `.env` edit are easier
  to spot there than in the editor.
- Squash-merge. With the merge setting in the checklist below, the pull
  request title becomes the commit on `main`, so it follows Conventional
  Commits exactly like a commit message does.
- Delete the branch. With "Automatically delete head branches" turned on,
  GitHub does it at merge time.
- A pull request that touches `schema.sql` also updates the matching models
  and the affected app README, and its description says how the change was
  applied to MySQL: the `ALTER` that was run, or that the database was
  dropped and `schema.sql` reapplied.

## Environment files

- `backend/.env` and `frontend/.env` are never committed. `.gitignore`
  excludes `.env` and `.env.*` at any depth and keeps only `.env.example`,
  and the tracked `.env.example` files hold placeholders, not real values.
- A new variable is added to the matching `.env.example` with a comment
  saying what it does and what happens when it is left blank, and is read in
  `backend/config/settings.py` with a default that is safe for development,
  so the site starts with nothing but the database settings filled in.
  `SECRET_KEY` and `DEBUG` are the pattern: unset, settings fall back to a
  development-only key and `DEBUG` on; production sets both.
- The front end only sees variables prefixed `VITE_`, and everything in
  `frontend/.env` ships in the bundle, so no secret ever goes there.
- A secret that reaches a commit is compromised, on any branch, whether or
  not the commit is later amended or the branch deleted. Rotate it first,
  then clean up the history.

## Schema changes

`schema.sql` is the whole schema and the only source of truth; the models
follow it. The order is always:

1. Edit `schema.sql`. A new column, index or constraint is a change to the
   file, not an `ALTER` run on the side and forgotten.
2. Apply it to MySQL. On a new install that is the README's
   `mysql ... < schema.sql` line; on a database that already holds data, run
   the matching `ALTER` by hand and say so in the pull request.
3. Mirror it in the unmanaged models. The six shared tables are mapped once
   in every travel app, so a column on `booking` is a change to `models.py`
   in `bus`, `train`, `plane`, `hotel` and `cab`.
4. Tests. `config.test_settings` builds the tables from the models, so a
   field the models do not declare is a field the tests cannot see.

Migrations are never generated for these tables. Every model is
`managed = False` and each travel app's `migrations/` holds only
`__init__.py`; only Django's own admin, auth and session tables migrate. If
`makemigrations` offers to create one for a travel app, a model has lost its
`managed = False`.

## Dependencies

- Dependabot (`.github/dependabot.yml`) opens one grouped pull request per
  ecosystem each Monday, for pip in `backend/`, npm in `frontend/` and the
  actions in the workflow, covering minor and patch bumps; a major bump
  arrives as its own pull request. Merge them when CI is green; read the
  changelog before merging a major.
- The pins in `backend/requirements.txt` are deliberate. Django stays on 6.0
  until the MySQL server is upgraded to 8.4, because 6.1 needs it, so
  `dependabot.yml` ignores Django minor and major bumps and only offers its
  patch releases. The move to 6.1 is made by hand, in the same pull request
  as the MySQL upgrade, and that ignore rule is removed with it.
- A new backend dependency is pinned to an exact version in
  `requirements.txt` with a comment saying what it is for. A new frontend
  dependency is added with `npm install`, which updates `package-lock.json`;
  commit both files.

## Repository settings

One-time setup in the GitHub web UI at
`https://github.com/Brahma4383/Ticket-Booking`. Everything below the first
item is under the Settings tab.

- [ ] Code tab, gear icon next to "About": set a description and topics
      (for example `django`, `django-rest-framework`, `react`, `vite`,
      `mysql`).
- [ ] Settings > General > Features: keep Issues on; the issue forms in
      `.github/ISSUE_TEMPLATE/` need it.
- [ ] Settings > General > Pull Requests: keep "Allow squash merging" on and
      set its default message to "Pull request title and description"; turn
      off "Allow merge commits" and "Allow rebase merging"; turn on
      "Automatically delete head branches".
- [ ] Settings > Rules > Rulesets > New ruleset > New branch ruleset. Name it
      `main`, set Enforcement status to Active, and under Target branches add
      "Include default branch". Then turn on:
  - [ ] Restrict deletions
  - [ ] Block force pushes
  - [ ] Require a pull request before merging, with Required approvals set
        to 0 while there is one maintainer, and "Require review from Code
        Owners" left off for the same reason: the author of a pull request
        cannot approve it.
  - [ ] Require status checks to pass, with "Require branches to be up to
        date before merging" on, and `backend` and `frontend` added as the
        required checks. They appear in the picker only after the workflow
        has run once, so push `.github/workflows/ci.yml` to `main` first.

  The older path, Settings > Branches > "Add classic branch protection
  rule", offers the same options.
- [ ] Settings > Code security: turn on Dependabot alerts, Dependabot
      security updates, Secret scanning, Push protection and Private
      vulnerability reporting. Dependabot version updates turn on by
      themselves once `.github/dependabot.yml` is on `main`.
- [ ] Settings > Actions > General > Workflow permissions: choose "Read
      repository contents and packages permissions" and leave "Allow GitHub
      Actions to create and approve pull requests" off.
