# Deployment invariant

The production server must never build the UI. This is a user-required safety rule.

- Never run `yarn build:ui:production` on the server.
- Never run `docker compose up --build` or any Docker image build on the server for a routine update.
- For UI changes, build the production assets locally, include the resulting `packages/ui-default/public` manifest and hashed chunks in the release commit, then push.
- On the server, only pull the prepared commit, restart Hydro, wait until it is healthy, then restart Judge.
- If the required static assets are not already in the commit, stop and build them locally; do not compensate by building on the server.

# Completion workflow

- After each requested code change passes its relevant checks, commit and push the prepared release into `master`, deploy that exact prepared commit through the user's available server terminal, then verify Hydro, Judge and the changed feature. The user has authorized this routine deployment workflow; complete it directly when the connection is available.
- The user has given standing authorization for these routine commits and pushes; do not leave validated changes only in the local worktree or ask for push permission again.

# Git connection

- In Work sessions, preserve the runtime's existing `GIT_SSH_COMMAND` proxy when selecting SSH 443. Replacing it with bare `ssh` can break DNS/network access.
- The verified command prefix is `GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -o HostName=ssh.github.com -p 443 -o ConnectTimeout=15 -o BatchMode=yes -o StrictHostKeyChecking=yes"`. Use normal Git fetch/push through this route; keep proxy values and credentials out of outputs.
