# Runs only on a disposable Windows CI runner. Never substitutes for a human clean-machine review.
$ErrorActionPreference = 'Stop'
$release = (Resolve-Path 'release').Path
$temporary = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }

function Test-RyvenExecutable([string]$file, [string]$label) {
  if (-not (Test-Path $file)) { throw "Missing executable for $label`: $file" }
  $reportPath = Join-Path $temporary "ryven-smoke-$label.json"
  Remove-Item $reportPath -ErrorAction SilentlyContinue
  $env:RYVEN_SMOKE_TEST = '1'
  $env:RYVEN_SMOKE_REPORT = $reportPath
  Write-Host "Testing ${label}: $file"
  $process = Start-Process -FilePath $file -PassThru
  try {
    $deadline = (Get-Date).AddSeconds(110)
    while (-not (Test-Path $reportPath) -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 700
      $process.Refresh()
      if ($process.HasExited -and $process.ExitCode -ne 0) {
        throw "$label exited $($process.ExitCode) before writing a smoke report."
      }
    }
    if (-not (Test-Path $reportPath)) { throw "$label did not write a smoke report in 110 seconds." }
    $report = Get-Content $reportPath -Raw | ConvertFrom-Json
    if (-not $report.ok -or -not $report.mounted -or -not $report.preload -or $report.platform -ne 'win32') {
      throw "$label failed renderer / secure preload / SQLite IPC smoke: $($report | ConvertTo-Json -Compress)"
    }
    # A written report can precede Electron's actual exit; never pass a crashing app.
    $process.Refresh()
    if (-not $process.HasExited -and -not $process.WaitForExit(15000)) {
      throw "$label produced a report but did not exit within 15 seconds."
    }
    if ($process.ExitCode -ne 0) { throw "$label exited $($process.ExitCode) after writing its report." }
    Write-Host "$label passed: $($report | ConvertTo-Json -Compress)"
  } finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item Env:RYVEN_SMOKE_TEST -ErrorAction SilentlyContinue
    Remove-Item Env:RYVEN_SMOKE_REPORT -ErrorAction SilentlyContinue
  }
}

Test-RyvenExecutable (Join-Path $release 'win-unpacked/RYVEN.exe') 'unpacked'
$portable = (Get-ChildItem (Join-Path $release '*-Portable.exe') | Select-Object -First 1).FullName
Test-RyvenExecutable $portable 'portable'

# Assisted NSIS installers accept /S for silent installation and /D=<path> as the last argument.
$installer = (Get-ChildItem (Join-Path $release '*-Setup.exe') | Select-Object -First 1).FullName
$installRoot = Join-Path $temporary 'RYVEN-install-smoke'
if (Test-Path $installRoot) { Remove-Item $installRoot -Recurse -Force }
Write-Host "Silently installing $installer to $installRoot"
$installStarted = Get-Date
$setup = Start-Process -FilePath $installer -ArgumentList '/S', "/D=$installRoot" -PassThru -Wait
if ($setup.ExitCode -ne 0) {
  # Do not hide native crashes with automatic retries. Capture available crash diagnostics.
  $applicationErrors = Get-WinEvent -FilterHashtable @{LogName = 'Application'; StartTime = $installStarted; Level = 2} -MaxEvents 20 -ErrorAction SilentlyContinue
  foreach ($crashEvent in $applicationErrors) {
    if ($crashEvent.Message -match 'RYVEN|NSIS|Setup') {
      Write-Warning "Windows Application Error $($crashEvent.Id): $($crashEvent.Message)"
    }
  }
  throw "Installer exited $($setup.ExitCode) (0x$('{0:X8}' -f ($setup.ExitCode -band 0xFFFFFFFF)))."
}
try {
  Test-RyvenExecutable (Join-Path $installRoot 'RYVEN.exe') 'installed'
} finally {
  $uninstaller = Get-ChildItem $installRoot -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($uninstaller) {
    $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
    if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited $($uninstall.ExitCode)." }
    Write-Host 'Silent uninstall completed.'
  } else {
    throw 'Installer did not produce an uninstaller.'
  }
}
