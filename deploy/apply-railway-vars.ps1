param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,

  [string]$Service = "",
  [string]$Environment = "production",
  [switch]$SkipDeploys
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  throw "Railway CLI belum terinstall. Install dulu dengan: npm i -g @railway/cli"
}

$resolvedEnvFile = Resolve-Path -LiteralPath $EnvFile
$statusOutput = railway status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $statusOutput
  throw "Railway belum login/link. Jalankan: railway login lalu railway link"
}

$commonArgs = @()
if ($Service) {
  $commonArgs += @("--service", $Service)
}
if ($Environment) {
  $commonArgs += @("--environment", $Environment)
}
if ($SkipDeploys) {
  $commonArgs += "--skip-deploys"
}

$setCount = 0
Get-Content -LiteralPath $resolvedEnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $separatorIndex = $line.IndexOf("=")
  if ($separatorIndex -le 0) {
    return
  }

  $key = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1)

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  if ($key -match "^\s*$") {
    return
  }

  $pair = "$key=$value"
  railway variable set @commonArgs $pair | Out-Null
  $setCount += 1
  Write-Host "set $key"
}

Write-Host "Selesai. Total variable diset: $setCount"
Write-Host "Redeploy service Railway setelah variable tersimpan."
