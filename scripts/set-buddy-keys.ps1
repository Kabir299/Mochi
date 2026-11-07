# Connects live buddies to your Supabase project. Asks for the Project URL and the publishable key
# (Supabase -> Settings -> API Keys), so they never have to be typed into a chat.
# Saves them to .env (ignored by git) for local testing, and to EAS for builds.
$ErrorActionPreference = 'Stop'

$url = (Read-Host 'Paste the Project URL, then press Enter').Trim().TrimEnd('/')
if ($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$') {
  throw 'That should look like https://abcd1234.supabase.co. Copy it again and rerun this.'
}

$secure = Read-Host 'Paste the publishable key (hidden), then press Enter' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($key.Length -lt 20) { throw 'That looks too short. Copy the whole key and rerun this.' }
# The secret key has full access to the database and must never go inside an app.
if ($key -like 'sb_secret_*') { throw 'That is the secret key. Copy the publishable key instead.' }

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$kept = @()
if (Test-Path $envFile) {
  $kept = @(Get-Content $envFile | Where-Object { $_ -notmatch '^EXPO_PUBLIC_SUPABASE_' })
}
[IO.File]::WriteAllLines($envFile, [string[]]($kept + @(
  "EXPO_PUBLIC_SUPABASE_URL=$url",
  "EXPO_PUBLIC_SUPABASE_KEY=$key"
)), (New-Object Text.UTF8Encoding $false))
Write-Host 'Saved to .env for local testing.'

Push-Location $root
try {
  foreach ($env in 'development', 'preview', 'production') {
    npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value $url --environment $env --visibility plaintext --non-interactive --force | Out-Null
    npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_KEY --value $key --environment $env --visibility plaintext --non-interactive --force | Out-Null
  }
} finally { Pop-Location }
Write-Host 'Saved to EAS for builds. All done - you can close this tab.'
