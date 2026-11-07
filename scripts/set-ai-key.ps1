# Points the app at the hosted AI server. Asks for APP_KEY (copy it from Render →
# habit-tracker-ai → Environment) so it never has to be typed into a chat or a file by hand.
# Saves it to .env (ignored by git) for local testing, and to EAS for store builds.
$ErrorActionPreference = 'Stop'
$url = 'https://habit-tracker-ai-mec4.onrender.com'

$secure = Read-Host 'Paste APP_KEY from Render (hidden), then press Enter' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($key.Length -lt 16) { throw 'That looks too short. Copy the whole APP_KEY value and run this again.' }

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$kept = @()
if (Test-Path $envFile) {
  $kept = @(Get-Content $envFile | Where-Object { $_ -notmatch '^EXPO_PUBLIC_(AI_URL|APP_KEY)=' })
}
[IO.File]::WriteAllLines($envFile, [string[]]($kept + @(
  "EXPO_PUBLIC_AI_URL=$url",
  "EXPO_PUBLIC_APP_KEY=$key"
)), (New-Object Text.UTF8Encoding $false))
Write-Host 'Saved to .env for local testing.'

Push-Location $root
try {
  foreach ($env in 'development', 'preview', 'production') {
    npx eas-cli@latest env:set --name EXPO_PUBLIC_AI_URL --value $url --environment $env --visibility plaintext --non-interactive | Out-Null
    npx eas-cli@latest env:set --name EXPO_PUBLIC_APP_KEY --value $key --environment $env --visibility sensitive --non-interactive | Out-Null
  }
} finally { Pop-Location }
Write-Host 'Saved to EAS for store builds. All done - you can close this tab.'
