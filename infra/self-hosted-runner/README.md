# Furvise self-hosted CI runner (phase 1)

This directory provisions a dedicated Linux x86-64 GitHub Actions runner. It does NOT replace GitHub as the repository or Vercel as the host. No deployment or database access is required.

## Safety boundaries
- Use a dedicated Ubuntu VM or host, NOT a developer workstation containing API keys, browser logins, production credentials, or personal files.
- Treat GitHub Actions workflow code as remote code execution on the runner.
- Never accept untrusted fork PR jobs on this persistent runner. Restrict who can edit workflows, approve changes, or manually dispatch jobs.
- Prefer an ephemeral runner/VM per job as the next iteration; wipe/reimage any persistent runner after suspected compromise.
- Keep runner registration tokens outside repository files, logs, and chat. They expire quickly.
- Give CI only read-only repository access. Do not add Supabase production or Vercel deploy tokens to the runner.
- Ensure outbound HTTPS, adequate RAM/disk, unattended security updates, isolated user, and restricted network reachability.

## Install
1. Provision an isolated Ubuntu x86-64 system with curl, tar, git, and sudo. Create a dedicated non-root user with only the permissions it needs.
2. In GitHub, open furvisepet/furvisepet > Settings > Actions > Runners > New self-hosted runner > Linux x64.
3. Copy the exact **runner version**, **SHA-256 checksum**, and temporary **registration token** shown in the official instructions. Do not store the token in shell history; preferably read it with a hidden prompt or use a short-lived secret injection system.
4. From an empty directory owned by the runner user, set RUNNER_VERSION and RUNNER_SHA256, set RUNNER_TOKEN via a secret input mechanism, and execute `bash install-ubuntu.sh`.
5. Review `./svc.sh` actions and start the service with `sudo ./svc.sh install <runner-user>` and `sudo ./svc.sh start`.
6. Verify GitHub reports the runner Online and tagged `self-hosted`, `Linux`, `X64`, `furvise-ci`.

## Qualification
After this PR is merged, manually start **Furvise Self-hosted Runner Smoke** from the Actions tab. Confirm successful checkout and runtime checks. Only then migrate one existing quality-gate workflow in a separate, reviewed PR. Do NOT change production CI runs-on labels before qualification.

## Cost and availability
Self-hosted runner jobs use local hardware instead of GitHub-hosted runner minutes, but still require repository Actions to be enabled and may be blocked by account/billing restrictions. Hosting, electricity, maintenance and artifact/storage limits remain.

## Rollback
Do not merge the follow-up CI migration if smoke fails. On the runner host: `sudo ./svc.sh stop`, then `sudo ./svc.sh uninstall`. Remove the runner through GitHub settings using a new removal token; do not delete its entry without verifying service status.