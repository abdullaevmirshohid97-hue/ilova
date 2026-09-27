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

# NATIVE BUYRUQLAR UCHUN "Stop" YARAMAYDI.
#
# PowerShell native dasturning stderr chiqishini ErrorRecord ga
# o‘raydi va "Stop" bilan u TERMINAL XATOGA aylanadi. Natijada
# `expo prebuild` ning oddiy OGOHLANTIRISHI —
#
#   » android: userInterfaceStyle: Install expo-system-ui...
#
# — butun skriptni to‘xtatib qo‘ydi, holbuki prebuild
# muvaffaqiyatli tugagandi.
#
# Shuning uchun natija CHIQISH KODIGA emas, DISKKA qarab
# tekshiriladi: papka yaratildimi, APK chiqdimi. Bu yerda
# sdkmanager bilan ham shunday bo‘lgan edi — u ishni
# bajargandan keyin 0xC0000409 bilan yiqilardi.
$ErrorActionPreference = "Continue"

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
  # Diskdan tekshiramiz: gradlew bo‘lmasa prebuild haqiqatan yiqilgan.
  if (-not (Test-Path (Join-Path $ANDROID "gradlew.bat"))) {
    Write-Host "prebuild yiqildi — gradlew.bat yo‘q" -ForegroundColor Red; exit 1
  }
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

# --- 3. EXPO_PUBLIC ni MUHITGA qo‘yish ---
#
# BU QADAM JIMGINA BUZUQ APK NI TO‘XTATADI.
#
# Metro uchun Gradle `root` i monorepo ildiziga qo‘yilgan
# (android-imzo.mjs, 3-bo‘lim). Natijada bundler ILDIZDAN
# yuritiladi va Expo `D:\ilova\.env` ni o‘qiydi —
# `apps\kassa\.env` esa umuman yuklanmaydi.
#
# Oqibati: `process.env.EXPO_PUBLIC_SUPABASE_URL` bundle‘da
# ALMASHTIRILMAGAN qoladi, `supabase.ts` esa import paytida
# `throw` qiladi — ilova ochilishida yiqiladi. Qurish esa
# YASHIL bo‘ladi. Aynan shunday to‘rtta APK chiqarilgan edi.
#
# Yechim: qiymatlarni HAQIQIY muhit o‘zgaruvchisi qilamiz.
# Babel `process.env.EXPO_PUBLIC_*` ni muhitdan ham inline
# qiladi, ya’ni ish papkasi ahamiyatsiz bo‘lib qoladi.
$envFayl = Join-Path $KASSA ".env"
if (-not (Test-Path $envFayl)) {
  Write-Host "apps\kassa\.env yo‘q — ilova bazaga ulanmaydi" -ForegroundColor Red; exit 1
}
$kutilgan = @()
foreach ($q in Get-Content $envFayl) {
  if ($q -match '^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$') {
    $nom = $Matches[1]; $qiymat = $Matches[2].Trim().Trim('"')
    if ($qiymat) {
      [Environment]::SetEnvironmentVariable($nom, $qiymat, "Process")
      $kutilgan += $nom
    }
  }
}
Bosqich ("muhitga qo‘yildi: " + ($kutilgan -join ", "))

# --- 4. JS to‘plamini MAJBURAN qayta yig‘ish ---
#
# Gradle `.env` ni kirish sifatida KUZATMAYDI. Shuning uchun
# `EXPO_PUBLIC_*` o‘zgarsa ham to‘plam vazifasi UP-TO-DATE
# bo‘lib o‘tib ketadi va eski qiymat APK da qoladi.
#
# Aynan shunday bo‘ldi: bot nomi .env ga yozildi, APK qayta
# qurildi, lekin bundle ichida bot nomi YO‘Q edi — Gradle uni
# keshdan olgandi. Xato jimgina: qurish yashil, natija eski.
#
# Yig‘ish ~8 soniya, shuning uchun har safar qilinadi.
$toplam = Join-Path $ANDROID "app\build\generated\assets\createBundleReleaseJsAndAssets"
if (Test-Path $toplam) {
  Remove-Item $toplam -Recurse -Force
  Bosqich "eski JS toplami ochirildi (.env ozgarishi uchun)"
}

# --- 5. Qurish ---
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

# --- BUNDLE TEKSHIRUVI ---
#
# Imzo to‘g‘ri bo‘lishi APK ISHLASHINI bildirmaydi. Agar
# `EXPO_PUBLIC_*` inline bo‘lmagan bo‘lsa, ilova ochilishida
# yiqiladi — va buni faqat telefonda bilardik.
#
# Shuning uchun APK ichidagi to‘plam OCHIB tekshiriladi:
# almashtirilmagan `process.env.EXPO_PUBLIC_` qolsa, qurish
# MUVAFFAQIYATSIZ hisoblanadi.
Bosqich "bundle tekshiruvi"
$tk = Join-Path $env:TEMP ("clary-bundle-" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Force -Path $tk | Out-Null
Copy-Item $apk (Join-Path $tk "a.zip") -Force
Expand-Archive (Join-Path $tk "a.zip") -DestinationPath (Join-Path $tk "ichi") -Force
$bfayl = Get-ChildItem (Join-Path $tk "ichi\assets") -Filter "index.android.bundle" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$yomon = $false
if (-not $bfayl) {
  Write-Host "  JS to‘plami APK da topilmadi" -ForegroundColor Red; $yomon = $true
} else {
  # IKKI KODLASHDA izlanadi va bu SHART.
  #
  # Release bundle — Hermes BAYT-KODI (imzosi c6 1f bc 03), sof
  # JS matni emas. Hermes ASCII satrlarni bir jadvalda, ASCII
  # bo‘lmaganlarini esa UTF-16 da saqlaydi.
  #
  # O‘zbekcha matnlarning deyarli hammasida ‘ yoki — bor, ya’ni
  # ular UTF-8 izlashda KO‘RINMAYDI. Bir marta shunday yolg‘on
  # xato oldim: «Sverka — PDF» yo‘q deb o‘yladim, aslida bor edi.
  $xb = [System.IO.File]::ReadAllBytes($bfayl.FullName)
  $bm8 = [System.Text.Encoding]::UTF8.GetString($xb)
  $bm16 = [System.Text.Encoding]::Unicode.GetString($xb)
  $bm = $bm8
  if ($bm.Contains("process.env.EXPO_PUBLIC_")) {
    Write-Host "  EXPO_PUBLIC almashtirilmagan — ilova ochilishida yiqiladi" -ForegroundColor Red
    $yomon = $true
  }
  foreach ($nom in $kutilgan) {
    $q = [Environment]::GetEnvironmentVariable($nom, "Process")
    if ($bm8.Contains($q) -or $bm16.Contains($q)) { Write-Host ("  OK  " + $nom) -ForegroundColor Green }
    else { Write-Host ("  YO‘Q " + $nom + " — qiymat to‘plamda yo‘q") -ForegroundColor Red; $yomon = $true }
  }
}
Remove-Item $tk -Recurse -Force -ErrorAction SilentlyContinue
if ($yomon) { Write-Host "`nAPK ISHLAMAYDI — chiqarilmadi." -ForegroundColor Red; exit 1 }

# --- 6. Imzoni TEKSHIRISH ---
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

# --- 7. VERSIYANI TEKSHIRISH ---
#
# 2026-09-27 da shu jimgina aldadi: `expo prebuild` mavjud
# `android/` ni qayta yozmaydi, shuning uchun `app.json` da
# versiyani ko'tarsak ham `build.gradle` da eskisi qolib ketardi.
# APK nomi app.json dan olinib `clary-2.14.0.apk` bo'lardi, ichida
# esa 2.12.0 turardi va `versionCode` o'smaganidan telefonga
# O'RNATILMASDI (INSTALL_FAILED_VERSION_DOWNGRADE).
#
# `android-imzo.mjs` buni tuzatadi, lekin tekshiruv shu yerda
# turadi: tuzatma ishlamay qolsa, APK ni "tayyor" deb aytmasin.
Bosqich "versiya tekshiruvi"
$app = Get-Content (Join-Path $KASSA "app.json") -Raw | ConvertFrom-Json
$versiya = $app.expo.version
$kod = $app.expo.android.versionCode
$aapt = Get-ChildItem "$SDK\build-tools\*\aapt2.exe" | Select-Object -Last 1
$manifest = cmd /c "`"$($aapt.FullName)`" dump badging `"$apk`" 2>&1" | Out-String
$vNom = if ($manifest -match "versionName='([^']+)'") { $Matches[1] } else { "?" }
$vKod = if ($manifest -match "versionCode='([^']+)'") { $Matches[1] } else { "?" }
if ($vNom -eq $versiya -and $vKod -eq [string]$kod) {
  Write-Host "  APK ichida $vNom / $vKod  — app.json bilan mos" -ForegroundColor Green
} else {
  Write-Host "  XATO: app.json $versiya / $kod, APK ichida $vNom / $vKod" -ForegroundColor Red
  Write-Host "  Sabab: build.gradle eski qolgan. `node scripts/android-imzo.mjs` ni yuritib qayta quring." -ForegroundColor Red
  exit 1
}

# --- 8. Chiqishga ko'chirish ---
$chiqish = Join-Path $ILDIZ "chiqish"
New-Item -ItemType Directory -Force -Path $chiqish | Out-Null
$nishon = Join-Path $chiqish "clary-$versiya.apk"
Copy-Item $apk $nishon -Force

Write-Host "`n=== TAYYOR ===" -ForegroundColor Green
"  {0}" -f $nishon
"  {0:N1} MB,  {1:N1} daqiqa" -f ((Get-Item $nishon).Length / 1MB), $sw.Elapsed.TotalMinutes
Write-Host "`nTelefonga: USB bilan ulab  adb install -r `"$nishon`"" -ForegroundColor Cyan
