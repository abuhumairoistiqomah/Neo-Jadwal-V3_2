# E-JADWAL V3.19 RC4.4.1 correction - run from project root after extracting patch.
$ErrorActionPreference = "Stop"
$legacy = Join-Path (Get-Location) "supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks_verify.sql"
if (Test-Path -LiteralPath $legacy) {
  Remove-Item -LiteralPath $legacy -Force
  Write-Host "Removed mislocated RC4.4 read-only verifier from migrations." -ForegroundColor Green
} else {
  Write-Host "Legacy verifier already absent: OK" -ForegroundColor Green
}
$files = Get-ChildItem -LiteralPath "supabase/migrations" -Filter "*.sql"
$duplicates = $files | Group-Object { ($_.Name -split '_')[0] } | Where-Object { $_.Count -gt 1 }
if ($duplicates) {
  $duplicates | ForEach-Object { Write-Host "Duplicate migration version: $($_.Name)" -ForegroundColor Red }
  exit 1
}
Write-Host "Migration versions unique: $($files.Count). Ready to test." -ForegroundColor Green
