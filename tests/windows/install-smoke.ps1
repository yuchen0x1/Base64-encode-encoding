param(
  [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version
)
$ErrorActionPreference = 'Stop'
if (!$IsWindows -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_ACTIONS -ne 'true') {
  throw 'Run the installer lifecycle only on an isolated GitHub-hosted Windows runner.'
}

$root = (New-Item -ItemType Directory -Path (Join-Path $env:RUNNER_TEMP "setup-smoke-$env:GITHUB_RUN_ID")).FullName
$installDir = Join-Path $root 'installed'
$exeName = '极客工具箱.exe'
$exe = Join-Path $installDir $exeName
$newInstaller = (Resolve-Path -LiteralPath "updates/desktop/GeekToolbox-Setup-$Version.exe").Path
$release = gh api "repos/$env:GITHUB_REPOSITORY/releases/latest" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot load the previous stable release.' }
$oldVersion = $release.tag_name.TrimStart('v')
if ([version]$oldVersion -ge [version]$Version) { throw 'Expected an older stable release for the upgrade smoke.' }

$oldName = "GeekToolbox-Setup-$oldVersion.exe"
$oldAsset = $release.assets | Where-Object name -CEQ $oldName
if ($oldAsset.digest -notmatch '^sha256:[0-9a-f]{64}$') { throw 'Previous installer lacks GitHub SHA-256 metadata.' }
gh release download $release.tag_name --pattern $oldName --dir $root
if ($LASTEXITCODE -ne 0) { throw 'Cannot download the previous installer.' }
$oldInstaller = Join-Path $root $oldName
if ("sha256:$((Get-FileHash -LiteralPath $oldInstaller).Hash)" -ne $oldAsset.digest) {
  throw 'Previous installer digest mismatch.'
}

function Install-Toolbox([string]$Installer) {
  $process = Start-Process -FilePath $Installer -ArgumentList "/S /D=$installDir" -PassThru -WindowStyle Hidden
  if (!$process.WaitForExit(90000)) { throw 'NSIS exceeded 90 seconds.' }
  if ($process.ExitCode -ne 0) { throw "NSIS failed with exit code $($process.ExitCode)." }
}

function Assert-InstalledVersion([string]$Expected) {
  node --input-type=module -e "import { verifyPayload } from './electron/installer-verification.js'; const result = verifyPayload(process.argv[1], process.argv[2], process.argv[3]); if (!result.ok) { console.error(result); process.exit(1) }" $installDir $exeName $Expected
  if ($LASTEXITCODE -ne 0) { throw "NSIS payload verification failed for $Expected." }
}

# Chromium uses the same profile before and after upgrade.
$profile = Join-Path $root 'profile'
function Test-Startup {
  $process = Start-Process -FilePath $exe -ArgumentList "--user-data-dir=`"$profile`"" -PassThru
  try {
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
      $process.Refresh()
      if ($process.HasExited) { throw "Application exited before opening its window ($($process.ExitCode))." }
      if ($process.MainWindowHandle -ne 0) { return }
      Start-Sleep -Milliseconds 250
    }
    throw 'NSIS-installed application did not open a window within 30 seconds.'
  } finally {
    if (!$process.HasExited) {
      [void]$process.CloseMainWindow()
      if (!$process.WaitForExit(10000)) {
        Stop-Process -Id $process.Id -Force
        if (!$process.WaitForExit(5000)) { throw 'Cannot close the smoke-test process.' }
      }
    }
  }
}

Install-Toolbox $oldInstaller
Assert-InstalledVersion $oldVersion
Test-Startup
$oldPreferences = Join-Path $profile 'Preferences'
if (!(Test-Path -LiteralPath $oldPreferences)) { throw 'Electron test profile was not created.' }
$marker = Join-Path $profile 'lifecycle-marker.txt'
Set-Content -LiteralPath $marker -Value 'preserve'
Install-Toolbox $newInstaller
Assert-InstalledVersion $Version
Test-Startup
if ((Get-Content -Raw -LiteralPath $marker).Trim() -ne 'preserve') { throw 'Profile lost during overwrite installation.' }

$failureCandidate = Join-Path $root 'payload-mismatch.exe'
Copy-Item -LiteralPath $newInstaller -Destination $failureCandidate
node tests/windows/rollback-smoke.mjs $installDir $exe $failureCandidate $oldInstaller $oldVersion $root $Version
if ($LASTEXITCODE -ne 0) { throw 'Automatic rollback did not restore the previous version.' }
Assert-InstalledVersion $oldVersion
Test-Startup
if ((Get-Content -Raw -LiteralPath $marker).Trim() -ne 'preserve') { throw 'Profile lost during rollback.' }

$uninstaller = @(Get-ChildItem -LiteralPath $installDir -Filter 'Uninstall *.exe' -File)
if ($uninstaller.Count -ne 1) { throw 'Expected one NSIS uninstaller.' }
$process = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S' -PassThru -WindowStyle Hidden
if (!$process.WaitForExit(60000) -or $process.ExitCode -ne 0) { throw 'Silent uninstall failed.' }
for ($attempt = 0; (Test-Path -LiteralPath $exe) -and $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 250
}
if (Test-Path -LiteralPath $exe) { throw 'Uninstaller left the application executable.' }
Write-Host "PASS: installed v$oldVersion, upgraded to v$Version, restored v$oldVersion after a forced version mismatch, opened both versions, preserved the profile, uninstalled."
