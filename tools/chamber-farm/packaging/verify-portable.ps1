param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ArchivePath) { $ArchivePath = Join-Path $projectDirectory 'dist\ChamberFarm-1.2.4-Windows-x64.zip' }
$verificationDirectory = Join-Path $projectDirectory ('dist\portable-qa-' + [Guid]::NewGuid().ToString('N') + ' Máy khác')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $verificationDirectory)
$bundleDirectory = Join-Path $verificationDirectory 'ChamberFarm'
$executable = Join-Path $bundleDirectory 'ChamberFarm.exe'
$environmentFile = Join-Path $bundleDirectory 'ChamberFarm-data\.env'
$originalTemplate = [IO.File]::ReadAllText($environmentFile)
# Inspect the embedded archive without executing or loading user configuration.
$assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($executable))
$payloadStream = $assembly.GetManifestResourceStream('ChamberFarm.Payload.zip')
$payload = New-Object IO.Compression.ZipArchive($payloadStream, [IO.Compression.ZipArchiveMode]::Read)
try {
    $forbidden = @('app/.env', 'app/state.json', 'app/runner.lock', 'app/rounds.jsonl', 'app/diagnostic.json')
    foreach ($entry in $payload.Entries) {
        $entryName = $entry.FullName.Replace('\', '/')
        if ($forbidden -contains $entryName -or $entryName.StartsWith('app/.ui/')) { throw 'Runtime payload includes private state.' }
    }
} finally { $payload.Dispose(); $payloadStream.Dispose() }
function Invoke-OfflineCheck([string]$FilePath) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $FilePath
    $start.Arguments = '--check'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.WorkingDirectory = $bundleDirectory
    $process = [Diagnostics.Process]::Start($start)
    try {
        if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'Portable configuration check timed out.' }
        return @{ ExitCode = $process.ExitCode; Text = $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd() }
    } finally { $process.Dispose() }
}
try {
    $blank = Invoke-OfflineCheck $executable
    if ($blank.ExitCode -eq 0 -or $blank.Text -notmatch 'DISCORD_USER_TOKEN') { throw 'Blank package token did not produce the expected local configuration error. Portable build may be reading original data.' }
    $offlineTemplate = $originalTemplate.Replace('DISCORD_USER_TOKEN=', 'DISCORD_USER_TOKEN=offline-portable-package-check')
    [IO.File]::WriteAllText($environmentFile, $offlineTemplate, (New-Object Text.UTF8Encoding($false)))
    $offline = Invoke-OfflineCheck $executable
    if ($offline.ExitCode -ne 0 -or $offline.Text -notmatch 'martingale' -or $offline.Text -notmatch '50') { throw ('Offline portable check failed: ' + $offline.Text) }
    if (Test-Path -LiteralPath (Join-Path $bundleDirectory 'ChamberFarm-data\state.json')) { throw 'Configuration check unexpectedly wrote session state.' }
    Write-Output 'PASS: blank token rejected; offline config passed from a different folder with spaces and Vietnamese text.'
    Write-Output 'PASS: original project configuration was not used; no Discord login, commands, or wagers.'
    Write-Output 'PASS: embedded payload excludes credentials, session files and logs.'
} finally {
    $verifiedDirectory = [IO.Path]::GetFullPath($verificationDirectory)
    $allowedRoot = [IO.Path]::GetFullPath((Join-Path $projectDirectory 'dist')) + [IO.Path]::DirectorySeparatorChar
    if (-not $verifiedDirectory.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe verification cleanup path.' }
    Remove-Item -LiteralPath $verifiedDirectory -Recurse -Force
}
