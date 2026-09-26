## What changed

<!-- One or two sentences. The diff shows how; say what. -->

## Why

<!-- What was wrong or missing, and why this is the right fix. Link the issue if there is one: Closes #12 -->

## Checklist

- [ ] Branch is up to date with `main`
- [ ] Backend tests pass locally: from `backend/` with the virtualenv activated, `python manage.py test --settings=config.test_settings`
- [ ] Frontend lint and build pass locally: from `frontend/`, `npm run lint` and `npm run build`
- [ ] `.env.example` updated, with a comment, if a variable was added
- [ ] `schema.sql`, the unmanaged models and the README updated together if the schema changed, and "What changed" says how it was applied to MySQL
- [ ] Title follows Conventional Commits, `type(scope): summary`; it becomes the squash commit on `main`
