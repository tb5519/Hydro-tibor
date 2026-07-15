# Deployment invariant

The production server must never build the UI. This is a user-required safety rule.

- Never run `yarn build:ui:production` on the server.
- Never run `docker compose up --build` or any Docker image build on the server for a routine update.
- For UI changes, build the production assets locally, include the resulting `packages/ui-default/public` manifest and hashed chunks in the release commit, then push.
- On the server, only pull the prepared commit, restart Hydro, wait until it is healthy, then restart Judge.
- If the required static assets are not already in the commit, stop and build them locally; do not compensate by building on the server.
