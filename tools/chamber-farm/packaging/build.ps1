param([switch]$Portable)

$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distributionDirectory = Join-Path $projectDirectory 'dist'
if ($Portable) { $distributionDirectory = Join-Path $distributionDirectory 'portable' }
$stagingDirectory = Join-Path $distributionDirectory ('payload-' + [Guid]::NewGuid().ToString('N'))
$appDirectory = Join-Path $stagingDirectory 'app'
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$dependencyDirectory = Join-Path $projectDirectory 'node_modules'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Missing .NET Framework C# compiler.' }
if (-not (Test-Path -LiteralPath $dependencyDirectory)) { throw 'Run npm ci --ignore-scripts first.' }

New-Item -ItemType Directory -Path $appDirectory -Force | Out-Null
Copy-Item -LiteralPath $nodeExecutable -Destination (Join-Path $stagingDirectory 'node.exe')
$sourceFiles = @('index.js', 'config.js', 'state.js', 'strategy.js', 'decision.js', 'interactions.js', 'post-guard.js', 'parser.js', 'engine.js', 'transport.js',
    'session.js', 'betting-controls.js', 'wallet-actions.js', 'ui-controller.js', 'ui-server.js',
    'package.json', 'package-lock.json', '.env.example', 'README.md', 'STRATEGY.md')
foreach ($sourceFile in $sourceFiles) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory $sourceFile) -Destination (Join-Path $appDirectory $sourceFile)
}
Copy-Item -LiteralPath $dependencyDirectory -Destination (Join-Path $appDirectory 'node_modules') -Recurse
Copy-Item -LiteralPath (Join-Path $projectDirectory 'ui') -Destination (Join-Path $appDirectory 'ui') -Recurse

# Explicit file allowlist above: credentials, runtime state, logs and locks are
# never copied into the archive or executable.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = Join-Path $distributionDirectory ('payload-' + [Guid]::NewGuid().ToString('N') + '.zip')
[IO.Compression.ZipFile]::CreateFromDirectory($stagingDirectory, $archivePath, [IO.Compression.CompressionLevel]::Optimal, $false)
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
$archiveStream = [IO.File]::OpenRead($archivePath)
try { $payloadHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($archiveStream)).Replace('-', '').ToLowerInvariant() }
finally { $archiveStream.Dispose(); $hashAlgorithm.Dispose() }
$embeddedProjectDirectory = if ($Portable) { '' } else { $projectDirectory }
$projectPathBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($embeddedProjectDirectory))
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Launcher.cs')).Replace('__PAYLOAD_HASH__', $payloadHash).Replace('__PROJECT_PATH_BASE64__', $projectPathBase64)
$generatedSourcePath = Join-Path $distributionDirectory 'Launcher.generated.cs'
[IO.File]::WriteAllText($generatedSourcePath, $source, (New-Object Text.UTF8Encoding($false)))
$executablePath = Join-Path $distributionDirectory 'ChamberFarm.exe'
& $compilerPath /nologo /target:exe /platform:x64 /optimize+ /codepage:65001 /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll "/resource:$archivePath,ChamberFarm.Payload.zip" "/out:$executablePath" $generatedSourcePath
if ($LASTEXITCODE -ne 0) { throw 'C# compilation failed.' }

# Clean only the unique temporary staging tree just created, after validating
# its resolved absolute location stays inside this project's dist directory.
$verifiedStaging = [IO.Path]::GetFullPath($stagingDirectory)
$verifiedDistribution = [IO.Path]::GetFullPath($distributionDirectory) + [IO.Path]::DirectorySeparatorChar
if (-not $verifiedStaging.StartsWith($verifiedDistribution, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to clean a staging directory outside dist.'
}
Remove-Item -LiteralPath $verifiedStaging -Recurse -Force
Remove-Item -LiteralPath $archivePath -Force
Write-Output ('Built: ' + $executablePath)
Write-Output ('Size: ' + [Math]::Round((Get-Item -LiteralPath $executablePath).Length / 1MB, 1) + ' MB')
