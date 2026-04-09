# Apply schema.sql to MySQL (Windows PowerShell).
# From repo root:  npm run db:schema
#   or:            .\database\run-schema.ps1
#
# Loads MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE from ..\ .env when set.
# MYSQL_PWD is deprecated but still works for non-interactive runs.

param(
    [string] $User = "",
    [string] $Database = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repoRoot ".env"

function Import-DotEnvLine {
    param([string] $Line)
    if ($Line -match '^\s*#' -or $Line -match '^\s*$') { return }
    $eq = $Line.IndexOf('=')
    if ($eq -lt 1) { return }
    $key = $Line.Substring(0, $eq).Trim()
    $val = $Line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    [PSCustomObject]@{ Key = $key; Value = $val }
}

if (Test-Path $envFile) {
    Get-Content -LiteralPath $envFile | ForEach-Object {
        $p = Import-DotEnvLine $_
        if ($null -ne $p) {
            Set-Item -Path "env:$($p.Key)" -Value $p.Value
        }
    }
}

if (-not $User) { $User = $env:MYSQL_USER }
if (-not $User) { $User = "root" }
if (-not $Database) { $Database = $env:MYSQL_DATABASE }
if (-not $Database) { $Database = "scheduforge" }

$schemaPath = Join-Path $PSScriptRoot "schema.sql"
if (-not (Test-Path $schemaPath)) {
    Write-Error "Missing $schemaPath"
}

Write-Host "Applying schema to database '$Database' as user '$User'..."

$sql = Get-Content -LiteralPath $schemaPath -Raw -Encoding UTF8
$oldPwd = $env:MYSQL_PWD
try {
    if ($env:MYSQL_PASSWORD) {
        $env:MYSQL_PWD = $env:MYSQL_PASSWORD
    }
    if ($env:MYSQL_PWD) {
        $sql | & mysql -u $User --default-character-set=utf8mb4 $Database
    }
    else {
        Write-Host 'No MYSQL_PASSWORD in .env - you will be prompted for password.'
        $sql | & mysql -u $User -p --default-character-set=utf8mb4 $Database
    }
}
finally {
    if ($null -eq $oldPwd) {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
    else {
        $env:MYSQL_PWD = $oldPwd
    }
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
Write-Host 'Done.'
