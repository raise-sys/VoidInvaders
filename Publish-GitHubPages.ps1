param(
    [string]$Repository = "raise-sys/VoidInvaders"
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$publishRoot = Join-Path $projectRoot ".pages-publish"
$siteRoot = Join-Path $publishRoot "wwwroot"
$repositoryName = ($Repository -split "/")[-1]
$basePath = "/$repositoryName/"
$remoteUrl = "https://github.com/$Repository.git"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) "VoidInvaders-gh-pages-$PID"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)] [string]$Command,
        [string[]]$Arguments = @()
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

try {
    if (Test-Path $publishRoot) {
        Remove-Item $publishRoot -Recurse -Force
    }
    Invoke-CheckedCommand dotnet -Arguments @(
        "publish",
        (Join-Path $projectRoot "SpaceInvader.csproj"),
        "-c", "Release",
        "-o", $publishRoot
    )

    $indexPath = Join-Path $siteRoot "index.html"
    $html = Get-Content $indexPath -Raw
    $html = $html.Replace('<base href="/" />', "<base href=`"$basePath`" />")
    Set-Content $indexPath $html -NoNewline
    Copy-Item $indexPath (Join-Path $siteRoot "404.html") -Force
    New-Item (Join-Path $siteRoot ".nojekyll") -ItemType File -Force | Out-Null

    New-Item $stagingRoot -ItemType Directory -Force | Out-Null
    Copy-Item (Join-Path $siteRoot "*") $stagingRoot -Recurse -Force
    New-Item (Join-Path $stagingRoot ".nojekyll") -ItemType File -Force | Out-Null

    Invoke-CheckedCommand git -Arguments @("-C", $stagingRoot, "init", "-b", "gh-pages")
    Invoke-CheckedCommand git -Arguments @("-C", $stagingRoot, "add", "-A")
    Invoke-CheckedCommand git -Arguments @("-C", $stagingRoot, "commit", "-m", "Publish GitHub Pages")
    Invoke-CheckedCommand git -Arguments @("-C", $stagingRoot, "remote", "add", "origin", $remoteUrl)
    Invoke-CheckedCommand git -Arguments @("-C", $stagingRoot, "push", "--force", "origin", "gh-pages")

    Write-Host "Published: https://$($Repository.Split('/')[0]).github.io/$repositoryName/"
}
finally {
    if (Test-Path $stagingRoot) {
        Remove-Item $stagingRoot -Recurse -Force
    }
}
