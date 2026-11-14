# Run once as the Windows user logged into gh auth.
# Creates an on-logon scheduled task; does not launch it immediately.
[CmdletBinding()]
param([switch]$Remove)
$ErrorActionPreference='Stop'
$taskName='Furvise Ephemeral CI Runner'
if($Remove){
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
  Write-Output 'Removed task; existing runner process (if any) must be stopped separately.'
  exit 0
}
$launcher=Join-Path $PSScriptRoot 'run-laptop-ephemeral.ps1'
if(!(Test-Path $launcher)){throw 'Runner launcher not found'}
if(-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)){throw 'Windows Task Scheduler unavailable'}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$launcher+'" -Loop -MaxJobs 0')
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal=New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'One-job disposable Furvise Linux GitHub runner; reviewed workflows only' -ErrorAction Stop | Out-Null
Write-Output 'Task registered for future Windows logons. It was not started immediately.'
Write-Output 'To remove: powershell -File install-laptop-autostart.ps1 -Remove'