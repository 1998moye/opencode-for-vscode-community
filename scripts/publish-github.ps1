param(
  [switch]$SkipPackage
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$repoPath = ($Root -replace "\\", "/")
git config --global --add safe.directory $repoPath 2>$null

if (-not $SkipPackage) {
  npm run package
}

$version = node -p "require('./package.json').version"
$tag = "v$version"
$vsix = Join-Path $Root "opencode-for-vscode-community-$version.vsix"

if (-not (Test-Path $vsix)) {
  throw "VSIX not found: $vsix"
}

git remote set-url origin https://github.com/1998moye/opencode-for-vscode-community.git
git add -A
$status = git status --porcelain
if ($status) {
  git commit -m "chore: release $version"
}
npm run push:gh
if ($LASTEXITCODE -ne 0) {
  git push -u origin main
}

$notesFile = Join-Path $env:TEMP "opencode-release-notes-$version.txt"
Set-Content -Path $notesFile -Encoding UTF8 -Value @(
  "Install: download opencode-for-vscode-community-$version.vsix, then Extensions > Install from VSIX."
  "Requires OpenCode CLI 1.17+, VS Code 1.106+."
  "Publisher: Dingzhen."
)

gh release create $tag --repo 1998moye/opencode-for-vscode-community --title "OpenCode VS Code Community $version" --notes-file $notesFile $vsix

Write-Host "Done: https://github.com/1998moye/opencode-for-vscode-community/releases/tag/$tag"
