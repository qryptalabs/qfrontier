# Task Scheduler owns this hidden foreground process. It intentionally waits for
# Node, preserving its exit code so Windows can restart a failed supervisor.
$ErrorActionPreference = 'Stop'
$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$supervisorFile = Join-Path $PSScriptRoot 'private-pc-supervisor.mjs'
$runnerLog = Join-Path $projectDirectory 'work/private-pc/logs/scheduled-runner.log'
$locationPushed = $false
function Write-RunnerLog([string]$message) {
  $safe = $message -replace '[\r\n]', ' ' -replace '\beyJ[A-Za-z0-9_.=-]{20,}', '[REDACTED_TOKEN]' -replace '((?i:authorization|token|access_token|client_secret)\s*[=:]\s*)\S+', '$1[REDACTED]'
  [System.IO.File]::AppendAllText($runnerLog,([datetime]::UtcNow.ToString('o') + ' ' + $safe + [Environment]::NewLine))
}
try {
  Write-RunnerLog 'runner_start'
  $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
  Push-Location -LiteralPath $projectDirectory
  $locationPushed = $true
  & $nodeExecutable $supervisorFile run
  $result = $LASTEXITCODE
  Write-RunnerLog ('runner_exit code=' + $result)
  exit $result
}
catch {
  Write-RunnerLog ('runner_error ' + $_.Exception.Message)
  exit 1
}
finally { if ($locationPushed) { Pop-Location } }
