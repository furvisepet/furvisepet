$ErrorActionPreference='Stop'
$repo='furvisepet/furvisepet'
Write-Output '=== REGISTERING ISOLATED EPHEMERAL RUNNER ==='
$token = (& gh api --method POST "repos/$repo/actions/runners/registration-token" --jq .token)
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)){throw 'GitHub refused registration token'}
$entry='cd /home/runner; IFS= read -r REGISTRATION_TOKEN; REGISTRATION_TOKEN="${REGISTRATION_TOKEN%?}"; if [ -z "$REGISTRATION_TOKEN" ]; then exit 21; fi; ./config.sh --url https://github.com/furvisepet/furvisepet --token "$REGISTRATION_TOKEN" --name furvise-laptop-smoke-1113 --labels furvise-ci --ephemeral --unattended --work _work; rc=$?; unset REGISTRATION_TOKEN; if [ "$rc" -ne 0 ]; then exit "$rc"; fi; exec ./run.sh'
$token | docker run --rm --init -i --name furvise-laptop-smoke-1113 --cpus 2 --memory 3g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=256m --pull never --entrypoint /bin/bash ghcr.io/actions/actions-runner@sha256:6d0b2d80d80f143f77dcb676e50920100bbb547e39e883454d57f45ab8c31300 -c $entry
$rc=$LASTEXITCODE
$token=$null
Write-Output "RUNNER_CONTAINER_EXIT=$rc"
if($rc -ne 0){throw "Runner container failed with exit code $rc"}
