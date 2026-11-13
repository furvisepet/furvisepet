# Furvise: one-job ephemeral runner on the Windows laptop.
# No production credentials, no host volume mounts, no Docker socket.
[CmdletBinding()]
param(
  [switch]$Loop,
  [int]$MaxJobs = 1
)
$ErrorActionPreference = 'Stop'
$repo='furvisepet/furvisepet'
$image='ghcr.io/actions/actions-runner@sha256:6d0b2d80d80f143f77dcb676e50920100bbb547e39e883454d57f45ab8c31300'
if ($MaxJobs -lt 0) { throw 'MaxJobs must not be negative' }
if (-not $Loop) { $MaxJobs=1 }
foreach($cmd in @('gh','docker')) {
  if(-not (Get-Command $cmd -ErrorAction SilentlyContinue)){throw "Command missing: $cmd"}
}
function Assert-Ready {
  $free=[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
  if($free -lt 2500){throw "Only $free MiB Windows RAM available; require 2500 MiB"}
  $info=& docker info --format '{{.OSType}} {{.MemTotal}} {{.NCPU}}' 2>$null
  if($LASTEXITCODE -ne 0){throw 'Docker Linux engine not ready'}
  $parts=$info -split '\s+'
  if($parts[0] -ne 'linux' -or [long]$parts[1] -lt 3500000000 -or [int]$parts[2] -lt 3){
    throw 'Docker Linux engine must expose >=3.5 GB memory and >=3 CPUs'
  }
}
$entry=[string]::Join([char]10,@(
  'cd /home/runner',
  'IFS= read -r REGISTRATION_TOKEN',
  'REGISTRATION_TOKEN="$(printf %s "$REGISTRATION_TOKEN" | tr -d ''\015\012'')"',
  'if [ -z "$REGISTRATION_TOKEN" ]; then exit 21; fi',
  './config.sh --url https://github.com/furvisepet/furvisepet --token "$REGISTRATION_TOKEN" --name "$RUNNER_NAME" --labels furvise-ci --ephemeral --unattended --work _work',
  'rc=$?',
  'unset REGISTRATION_TOKEN',
  'if [ "$rc" -ne 0 ]; then exit "$rc"; fi',
  'exec ./run.sh'
))
$i=0
do {
  Assert-Ready
  $existing=@(& docker ps -a --filter 'label=furvise.runner=onejob' --format '{{.Names}}')
  if($existing.Count -gt 0){throw "A Furvise runner container is already present; inspect it before retrying"}
  $token=& gh api --method POST "repos/$repo/actions/runners/registration-token" --jq '.token'
  if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)){throw 'Cannot register runner; check GitHub admin rights'}
  $name='furvise-ci-'+(Get-Date -Format 'yyyyMMddHHmmss')+'-'+$PID
  try {
    Write-Output "Runner ${name}: waiting for one trusted furvise-ci GitHub job."
    $token | & docker run --rm --init -i --name $name --label 'furvise.runner=onejob' --cpus 2 --memory 3g --memory-swap 3g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=256m --env "RUNNER_NAME=$name" --pull never --entrypoint /bin/bash $image -c $entry
    $exit=$LASTEXITCODE
  } finally {
    $token=$null
  }
  if($exit -ne 0){throw "Runner terminated with exit $exit; inspect GitHub job result before retrying"}
  $i++
  if($Loop -and ($MaxJobs -eq 0 -or $i -lt $MaxJobs)){Start-Sleep -Seconds 15}
} while($Loop -and ($MaxJobs -eq 0 -or $i -lt $MaxJobs))