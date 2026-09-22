# =============================================================
#  CLARY — MAHALLIY APK QURISH
#
#  EAS bepul rejasida oylik limit bor va u 21.09 da tugadi.
#  Native modul (masalan PIN/barmoq izi) qo'shilganda APK siz
#  na yozib, na sinab bo'ladi — shuning uchun qurish shu yerga
#  ko'chirildi.
#
#  Bitta buyruq: prebuild -> tuzatish -> gradle -> imzo tekshiruvi.
#
#  Ishlatish:
#    .\scripts\apk-qur.ps1              # oddiy
#    .\scripts\apk-qur.ps1 -Toza        # android/ ni qayta yaratadi
#
#  Reja va sabablar: PLAN-MAHALLIY-QURISH.md
# =============================================================
param(
  [switch]$Toza
)

$ErrorActionPreference = "Stop"

$ILDIZ = Split-Path -Parent $PSScriptRoot
$KASSA = Join-Path $ILDIZ "apps\kassa"
$ANDROID = Join-Path $KASSA "android"
$SDK = "D:\android-sdk-b2b\Sdk"

# --- Muhit ---
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = $SDK
$env:ANDROID_SDK_ROOT = $SDK
$env:GRADLE_USER_HOME = "D:\android-sdk-b2b\gradle"

function Bosqich($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  Write-Host "JDK topilmadi: $env:JAVA_HOME" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "$SDK\platforms\android-36\android.jar")) {
  Write-Host "Android SDK to'liq emas: $SDK" -ForegroundColor Red
  Write-Host "PLAN-MAHALLIY-QURISH.md, Faza 2 ga qarang" -ForegroundColor Yellow; exit 1
}

# --- 1. Prebuild ---
if ($Toza -and (Test-Path $ANDROID)) {
  Bosqich "android/ o'chirilmoqda (-Toza)"
  Remove-Item $ANDROID -Recurse -Force
}
if (-not (Test-Path $ANDROID)) {
  Bosqich "expo prebuild"
  Push-Location $KASSA
  cmd /c "npx expo prebuild --platform android --no-install"
  Pop-Location
  if (-not (Test-Path $ANDROID)) { Write-Host "prebuild yiqildi" -ForegroundColor Red; exit 1 }
}

# --- 2. Prebuild qoldirgan kamchiliklarni tuzatish ---
#
# Bu HAR SAFAR chaqiriladi: prebuild `android/` ni qayta yozadi va
# imzo sozlamasi yo'qoladi. Qo'lda tuzatish bir marta ishlaydi,
# keyingi prebuild'da esa jimgina yo'qoladi — shuning uchun skript.
Bosqich "imzo va arxitekturalar"
Push-Location $ILDIZ
node scripts/android-imzo.mjs
Pop-Location

"sdk.dir=" + $SDK.Replace('\', '\\') | Out-File (Join-Path $ANDROID "local.properties") -Encoding ascii

# --- 3. Qurish ---
Bosqich "gradle assembleRelease"
$sw = [Diagnostics.Stopwatch]::StartNew()
Push-Location $ANDROID
# TO‘LIQ YO‘L bilan: cmd bare nom bilan wrapper ni topmadi
& (Join-Path $ANDROID "gradlew.bat") assembleRelease --no-daemon
$kod = $LASTEXITCODE
Pop-Location
$sw.Stop()

$apk = Join-Path $ANDROID "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) {
  Write-Host "`nAPK chiqmadi (gradle kodi $kod)" -ForegroundColor Red; exit 1
}

# --- 4. Imzoni TEKSHIRISH ---
#
# Eng muhim tekshiruv. Debug kaliti bilan imzolangan APK mavjud
# ilovaning ustiga O'RNATILMAYDI va buni faqat telefonda,
# o'rnatishga urinib ko'rgandagina bilardik.
Bosqich "imzo tekshiruvi"
$apksigner = Get-ChildItem "$SDK\build-tools\*\apksigner.bat" | Select-Object -Last 1
$imzo = cmd /c "`"$($apksigner.FullName)`" verify --print-certs `"$apk`" 2>&1" | Out-String
if ($imzo -match "CN=([^,`r`n]+)") { Write-Host "  sertifikat: $($Matches[1])" }
if ($imzo -match "debug") {
  Write-Host "  DIQQAT: debug kaliti bilan imzolangan! Eskisining ustiga o'rnatilmaydi." -ForegroundColor Red
} else {
  Write-Host "  haqiqiy kalit bilan imzolangan" -ForegroundColor Green
}

# --- 5. Chiqishga ko'chirish ---
$versiya = (Get-Content (Join-Path $KASSA "app.json") -Raw | ConvertFrom-Json).expo.version
$chiqish = Join-Path $ILDIZ "chiqish"
New-Item -ItemType Directory -Force -Path $chiqish | Out-Null
$nishon = Join-Path $chiqish "clary-$versiya.apk"
Copy-Item $apk $nishon -Force

Write-Host "`n=== TAYYOR ===" -ForegroundColor Green
"  {0}" -f $nishon
"  {0:N1} MB,  {1:N1} daqiqa" -f ((Get-Item $nishon).Length / 1MB), $sw.Elapsed.TotalMinutes
Write-Host "`nTelefonga: USB bilan ulab  adb install -r `"$nishon`"" -ForegroundColor Cyan
