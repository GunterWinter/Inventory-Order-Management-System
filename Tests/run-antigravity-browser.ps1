param(
    [int]$Port = 5127,
    [string]$DatabaseName = ("WHMS_AntigravityTest_{0}" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$databasePattern = '^WHMS_AntigravityTest_[A-Za-z0-9_]+$'
if ($DatabaseName -notmatch $databasePattern) {
    throw "The test database must start with WHMS_AntigravityTest_ and contain only letters, numbers, or underscores."
}

$existingListener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($existingListener) {
    throw "Port $Port is already in use; Antigravity cannot start safely."
}

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
    throw 'sqlcmd was not found; the runner cannot guarantee cleanup of the test database.'
}

$runKey = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
$artifactRoot = Join-Path $repositoryRoot 'artifacts'
$runDirectory = Join-Path $artifactRoot "antigravity_$runKey"
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$stdoutPath = Join-Path $runDirectory 'application.stdout.log'
$stderrPath = Join-Path $runDirectory 'application.stderr.log'
$buildArtifacts = Join-Path $runDirectory 'build'
$appProcess = $null
$testExitCode = 1
$locationPushed = $false
$cleanupError = $null

try {
    Push-Location $repositoryRoot
    $locationPushed = $true

    # Rebuild project.assets.json without contacting NuGet. This is deterministic
    # when the developer/CI machine has already restored the repository packages,
    # and avoids signature endpoint failures during an otherwise --no-restore build.
    $offlineNuGetSource = Join-Path $runDirectory 'nuget-offline-source'
    New-Item -ItemType Directory -Force -Path $offlineNuGetSource | Out-Null
    & dotnet restore Indotalent.sln --artifacts-path $buildArtifacts --source $offlineNuGetSource --ignore-failed-sources -p:NuGetAudit=false
    if ($LASTEXITCODE -ne 0) { throw "Offline dotnet restore failed with exit code $LASTEXITCODE." }

    & dotnet build Indotalent.sln --no-restore --artifacts-path $buildArtifacts
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed with exit code $LASTEXITCODE." }

    $env:ConnectionStrings__DefaultConnection = "Server=localhost;Database=$DatabaseName;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;"
    $env:Kestrel__Endpoints__Http__Url = "http://localhost:$Port"
    $env:IsDemoVersion = 'true'
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:BASE_URL = "http://localhost:$Port"

    $appProcess = Start-Process -FilePath dotnet `
        -ArgumentList @(Join-Path $buildArtifacts 'bin/ASPNET/debug/ASPNET.dll') `
        -WorkingDirectory (Join-Path $repositoryRoot 'Presentation/ASPNET') `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $deadline = (Get-Date).AddSeconds(120)
    $ready = $false
    while ((Get-Date) -lt $deadline -and -not $ready) {
        if ($appProcess.HasExited) {
            throw "The test application exited early. See logs at $runDirectory."
        }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "$env:BASE_URL/Accounts/Login" -TimeoutSec 5
            $ready = $response.StatusCode -eq 200
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) { throw 'The test application was not ready after 120 seconds.' }

    & npm.cmd run test:browser:all
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) { throw "Browser regression failed with exit code $testExitCode." }
} finally {
    if ($appProcess -and -not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force
        $appProcess.WaitForExit()
    }

    $dropSql = "IF DB_ID(N'$DatabaseName') IS NOT NULL BEGIN ALTER DATABASE [$DatabaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DatabaseName]; END"
    & $sqlcmd.Source -S localhost -E -b -Q $dropSql
    if ($LASTEXITCODE -ne 0) {
        $testExitCode = 1
        $cleanupError = "Could not drop test database $DatabaseName; sqlcmd returned exit code $LASTEXITCODE."
    }

    if ($locationPushed) { Pop-Location }
    if ($testExitCode -eq 0) {
        $resolvedRun = [System.IO.Path]::GetFullPath($runDirectory)
        $resolvedArtifacts = [System.IO.Path]::GetFullPath($artifactRoot)
        if ($resolvedRun.StartsWith($resolvedArtifacts, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedRun -Recurse -Force
        }
    } else {
        Write-Host "Failure artifacts retained at $runDirectory"
    }
}

if ($cleanupError) { throw $cleanupError }

exit $testExitCode
