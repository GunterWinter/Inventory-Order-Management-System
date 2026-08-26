param(
    [int]$Port = 5127,
    [string]$DatabaseName = ("WHMS_UiRegression_{0}" -f (Get-Date -Format 'yyyyMMdd_HHmmss')),
    [string]$PlaywrightGrep = ''
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$databasePattern = '^WHMS_UiRegression_[A-Za-z0-9_]+$'
if ($DatabaseName -notmatch $databasePattern) {
    throw 'The test database must start with WHMS_UiRegression_ and contain only letters, numbers, or underscores.'
}

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use; the isolated browser runner cannot start safely."
}

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) { throw 'sqlcmd was not found; safe test-database cleanup cannot be guaranteed.' }

$runKey = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
$artifactRoot = Join-Path $repositoryRoot 'artifacts/browser-regression'
$runDirectory = Join-Path $artifactRoot "runs/$runKey"
$evidenceDirectory = Join-Path $runDirectory 'evidence'
$latestDirectory = Join-Path $artifactRoot 'latest'
$buildArtifacts = Join-Path $runDirectory 'build'
$stdoutPath = Join-Path $runDirectory 'application.stdout.log'
$stderrPath = Join-Path $runDirectory 'application.stderr.log'
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null

$appProcess = $null
$testExitCode = 1
$locationPushed = $false
$cleanupError = $null

try {
    Push-Location $repositoryRoot
    $locationPushed = $true
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
    $env:BROWSER_EVIDENCE_DIR = $evidenceDirectory

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
        if ($appProcess.HasExited) { throw "The test application exited early. See $runDirectory." }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "$env:BASE_URL/Accounts/Login" -TimeoutSec 5
            $ready = $response.StatusCode -eq 200
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) { throw 'The test application was not ready after 120 seconds.' }

    if ([string]::IsNullOrWhiteSpace($PlaywrightGrep)) {
        & npm.cmd run test:browser:all
    } else {
        & npx.cmd playwright test --grep $PlaywrightGrep
    }
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
    if ($testExitCode -eq 0 -and -not $cleanupError) {
        $resolvedArtifacts = [System.IO.Path]::GetFullPath($artifactRoot)
        $resolvedRun = [System.IO.Path]::GetFullPath($runDirectory)
        $resolvedLatest = [System.IO.Path]::GetFullPath($latestDirectory)
        if (-not $resolvedRun.StartsWith($resolvedArtifacts, [System.StringComparison]::OrdinalIgnoreCase) `
            -or -not $resolvedLatest.StartsWith($resolvedArtifacts, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Resolved browser artifact paths escaped the intended artifact directory.'
        }
        if (Test-Path -LiteralPath $resolvedLatest) { Remove-Item -LiteralPath $resolvedLatest -Recurse -Force }
        Move-Item -LiteralPath $evidenceDirectory -Destination $resolvedLatest
        Remove-Item -LiteralPath $resolvedRun -Recurse -Force
        Write-Host "Latest successful browser screenshots: $resolvedLatest"
    } else {
        Write-Host "Failure artifacts retained at $runDirectory"
    }
}

if ($cleanupError) { throw $cleanupError }
exit $testExitCode
