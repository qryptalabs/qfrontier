[CmdletBinding()]
param(
  [ValidateSet('start', 'stop', 'status', 'restart', 'install-login-task', 'uninstall-login-task', 'install-backup-task', 'uninstall-backup-task')]
  [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$supervisorFile = Join-Path $PSScriptRoot 'private-pc-supervisor.mjs'
$backupFile = Join-Path $PSScriptRoot 'private-pc-backup.mjs'
$scheduledRunner = Join-Path $PSScriptRoot 'private-pc-scheduled-run.ps1'
$windowsPowerShellExecutable = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$isBackupAction = $Action -in @('install-backup-task', 'uninstall-backup-task')
$taskName = if ($isBackupAction) { 'QfrontierPrivatePCBackup' } else { 'QfrontierPrivatePC' }
$taskArguments = if ($isBackupAction) { '"' + $backupFile + '"' } else { '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + $scheduledRunner + '"' }
$taskExecutable = if ($isBackupAction) { $nodeExecutable } else { $windowsPowerShellExecutable }

function Assert-OwnScheduledTask($task) {
  $matchesCurrent = $task.Actions[0].Arguments -ceq $taskArguments -and $task.Actions[0].Execute -ieq $taskExecutable
  $legacyArguments = @(('"' + $supervisorFile + '" start'), ('"' + $supervisorFile + '" run'))
  $previousRunnerArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $scheduledRunner + '"'
  $matchesLegacy = -not $isBackupAction -and (($task.Actions[0].Execute -ieq $nodeExecutable -and $task.Actions[0].Arguments -cin $legacyArguments) -or ($task.Actions[0].Execute -ieq $windowsPowerShellExecutable -and $task.Actions[0].Arguments -ceq $previousRunnerArguments))
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $principalSid = if ($task.Principal.UserId -like 'S-1-*') { $task.Principal.UserId } else { ([System.Security.Principal.NTAccount]$task.Principal.UserId).Translate([System.Security.Principal.SecurityIdentifier]).Value }
  if ($task.Actions.Count -ne 1 -or (-not $matchesCurrent -and -not $matchesLegacy) -or $task.Actions[0].WorkingDirectory -ine $projectDirectory -or $principalSid -cne $currentSid -or [string]$task.Principal.LogonType -cne 'Interactive' -or [string]$task.Principal.RunLevel -cne 'Limited') {
    throw ('A different scheduled task already uses ' + $taskName + '. It will not be modified.')
  }
}

if ($Action -in @('install-login-task', 'install-backup-task')) {
  if ($isBackupAction -and -not (Test-Path -LiteralPath $backupFile -PathType Leaf)) { throw 'The local-only backup script is missing.' }
  if (-not $isBackupAction -and -not (Test-Path -LiteralPath $scheduledRunner -PathType Leaf)) { throw 'The hidden foreground runner is missing.' }
  $existingTask = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
  if ($null -ne $existingTask) { Assert-OwnScheduledTask $existingTask }
  $taskAction = New-ScheduledTaskAction -Execute $taskExecutable -Argument $taskArguments -WorkingDirectory $projectDirectory
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $trigger = if ($isBackupAction) {
    New-ScheduledTaskTrigger -Once -At ((Get-Date).AddHours(1)) -RepetitionInterval (New-TimeSpan -Hours 1)
  } else {
    New-ScheduledTaskTrigger -AtLogOn -User $currentUser
  }
  $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
  $executionLimit = if ($isBackupAction) { New-TimeSpan -Minutes 10 } else { [TimeSpan]::Zero }
  $taskSettings = if ($isBackupAction) {
    New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit $executionLimit -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  } else {
    New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit $executionLimit -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  }
  if (-not $isBackupAction) { $taskSettings.ExecutionTimeLimit = 'PT0S' }
  $description = if ($isBackupAction) { 'Hourly coherent backup of the isolated local Qfrontier PC database. No remote access, no imports and no backup deletion.' } else { 'Starts the private Qfrontier PC supervisor after this user signs in. Does not modify production or import data.' }
  Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $taskAction -Trigger $trigger -Principal $principal -Settings $taskSettings -Description $description -Force | Out-Null
  Write-Output ('Optional task ' + $taskName + ' installed. No server or backup was started by this command.')
  exit 0
}
if ($Action -in @('uninstall-login-task', 'uninstall-backup-task')) {
  $existingTask = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
  if ($null -ne $existingTask) { Assert-OwnScheduledTask $existingTask; Unregister-ScheduledTask -TaskName $taskName -TaskPath '\' -Confirm:$false }
  Write-Output ('Optional task ' + $taskName + ' removed. Running server processes were not stopped.')
  exit 0
}

Push-Location -LiteralPath $projectDirectory
try {
  & $nodeExecutable $supervisorFile $Action
  exit $LASTEXITCODE
}
finally { Pop-Location }
