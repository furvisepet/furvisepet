#!/usr/bin/env bash
set -Eeuo pipefail
# Run on a dedicated, freshly provisioned Ubuntu x86-64 host as an unprivileged runner user.
# Supply variables from GitHub's repository Settings > Actions > Runners > New self-hosted runner.
: "${RUNNER_TOKEN:?Missing short-lived registration token}"
: "${RUNNER_VERSION:?Set version from GitHub's official runner instructions}"
: "${RUNNER_SHA256:?Set SHA-256 from GitHub's official runner instructions}"
RUNNER_URL="https://github.com/furvisepet/furvisepet"
RUNNER_NAME="${RUNNER_NAME:-furvise-linux-$(hostname -s)}"
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Requires Linux x86_64" >&2; exit 1
fi
if [[ "$EUID" -eq 0 ]]; then echo "Run as an unprivileged, dedicated user" >&2; exit 1; fi
if [[ -e ./config.sh || -e ./.runner ]]; then echo "Existing runner detected; refusing overwrite" >&2; exit 1; fi
archive="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
url="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${archive}"
curl --fail --location --silent --show-error --retry 3 "$url" -o "$archive"
echo "${RUNNER_SHA256}  ${archive}" | sha256sum --check --status || { echo "Runner archive checksum mismatch" >&2; exit 1; }
tar -xzf "$archive"
rm -f "$archive"
./config.sh --url "$RUNNER_URL" --token "$RUNNER_TOKEN" --name "$RUNNER_NAME" --labels furvise-ci --unattended
unset RUNNER_TOKEN
echo "Registration complete. To start the service after review:"
echo "  sudo ./svc.sh install $(id -un)"
echo "  sudo ./svc.sh start"