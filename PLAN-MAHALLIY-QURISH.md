# Mahalliy APK qurish — reja

Maqsad: EAS limitidan qutulish va APK ni o'z kompyuterimizda qurish.
Sabab: 21.09 da EAS bepul rejasining oylik limiti tugadi (1-oktabrda
tiklanadi), PIN/chizma bilan kirish esa **native modul** talab qiladi —
ya'ni uni yangi APK siz na yozib, na sinab bo'ladi.

## Kompyuterdagi holat (23.09 da o'lchandi)

| Narsa | Holat |
|---|---|
| Android Studio | **bor** — `C:\Program Files\Android\Android Studio` |
| JDK | **bor** — Studio ichidagi JBR 21.0.10 |
| Android SDK | **YO'Q** — `ANDROID_HOME` mavjud bo'lmagan papkaga ishora qiladi |
| `C:` bo'sh joy | **5.0 GB** — yetmaydi |
| `D:` bo'sh joy | 291.2 GB |
| Imzo kaliti | **bor** — `kodchi/credit-debit.jks`, alias `credit-debit` |
| `apps/kassa/android/` | yo'q (prebuild qilinmagan) va **gitignore'da emas** |

Ikki xulosa shundan chiqadi va ular butun rejani belgilaydi:

1. **Hamma narsa `D:` ga o'rnatiladi.** SDK ham, Gradle keshi ham.
   `C:` da 5 GB qolgan, kerak esa 4-6 GB.
2. **Prebuild SDK dan OLDIN qilinadi.** Prebuild'ga SDK kerak emas, u
   faqat node bilan ishlaydi — lekin u yaratgan `build.gradle` aynan
   qaysi SDK versiyasi kerakligini aytadi. Shunda keraksiz paket
   yuklab olinmaydi.

---

## Faza 0 — Yo'llar

`D:\Android\` ostida ikki papka: `Sdk` va `gradle`.

Muhit o'zgaruvchilari (foydalanuvchi darajasida, tizim emas):

```
ANDROID_HOME      D:\Android\Sdk
ANDROID_SDK_ROOT  D:\Android\Sdk
GRADLE_USER_HOME  D:\Android\gradle
```

`GRADLE_USER_HOME` alohida muhim: usiz Gradle o'z keshini
`C:\Users\user\.gradle` ga yozadi va 5 GB ni yeb qo'yadi.

Hozirgi `ANDROID_HOME` **noto'g'ri** — u yo'q papkaga ishora qiladi.
Uni tuzatish shart, aks holda `sdkmanager` ham, Gradle ham adashadi.

**Tekshiruv:** yangi terminal ochib `echo %ANDROID_HOME%` to'g'ri
yo'lni bersin.

## Faza 1 — Prebuild

Avval `.gitignore` ga:

```
apps/kassa/android/
apps/kassa/ios/
```

Busiz prebuild ~150 ta yaratilgan native faylni repoga tiqadi. Ular
yaratiladigan narsa — qo'lda tahrir qilinmaydi va git'da turmasligi
kerak.

```
cd apps/kassa
npx expo prebuild --platform android
```

Keyin `android/build.gradle` dan ANIQ raqamlarni o'qiymiz:
`compileSdkVersion`, `targetSdkVersion`, `buildToolsVersion`,
`ndkVersion` (bo'lsa).

**Tekshiruv:** `apps/kassa/android/gradlew` fayli paydo bo'lsin va
`git status` toza qolsin.

> **NDK haqida.** Agar `ndkVersion` yozilgan bo'lsa — u 3-5 GB. Avval
> NDK siz qurib ko'ramiz: ko'p loyihada u faqat manba'dan quriladigan
> kutubxona bo'lsa kerak bo'ladi. Kerak bo'lsa xato aniq aytadi.

## Faza 2 — SDK o'rnatish

`commandlinetools-win` arxivi → `D:\Android\Sdk\cmdline-tools\latest\`
(ichida `bin`, `lib` bo'lishi kerak — bitta papka ortiqcha bo'lsa
`sdkmanager` ishlamaydi, bu eng ko'p uchraydigan xato).

```
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-NN" "build-tools;NN.0.0"
```

`NN` — Faza 1 da o'qilgan raqam.

Taxminiy hajm: platform-tools ~15 MB, platform ~150 MB, build-tools
~60 MB. NDK kerak bo'lsa +3.5 GB.

**Tekshiruv:** `sdkmanager --list_installed` uchalasini ko'rsatsin.

## Faza 3 — Imzo

Kalit bor: `kodchi/credit-debit.jks`, parollari `credentials.json` da.

Ikki qoida:

1. **Parol repoga tushmaydi.** `kodchi/` gitignore'da va shunday
   qoladi. Gradle parolni `D:\Android\gradle\gradle.properties` dan
   oladi — u repodan tashqarida.
2. **Prebuild `android/` ni qayta yozadi.** Ya'ni `build.gradle` ga
   qo'lda yozilgan imzo bloki keyingi prebuild'da yo'qoladi. Shuning
   uchun imzo **skript bilan** qo'yiladi, qo'lda emas.

**Tekshiruv:** qurilgan APK ni `apksigner verify --print-certs` bilan
tekshirib, alias `credit-debit` ekanini ko'rish. Bu muhim: noto'g'ri
kalit bilan imzolangan APK eskisining ustiga **o'rnatilmaydi**.

## Faza 4 — Birinchi qurish

```
cd apps/kassa/android
./gradlew assembleRelease
```

Birinchi yurish uzoq: Gradle distributivi (~200 MB) va bog'liqliklar
(~1-2 GB) yuklab olinadi. **20-40 daqiqa** kutish kerak. Keyingilari
2-5 daqiqa.

Natija: `android/app/build/outputs/apk/release/app-release.apk`

**Tekshiruv:** APK telefonga o'rnatilsin va ochilsin.

## Faza 5 — Takrorlanuvchan qilish

`kodchi/apk-qur.ps1` — bitta buyruq:

1. `expo prebuild` (kerak bo'lsa)
2. imzo blokini qo'yish (Faza 3)
3. `gradlew assembleRelease`
4. APK ni `D:\ilova\chiqish\clary-<versiya>.apk` ga ko'chirish

`CLAUDE.md` ning «Ish oqimi» bo'limiga yoziladi.

**Tekshiruv:** toza holatdan bitta buyruq bilan APK chiqsin.

---

## Faza 6 — PIN va chizma (asl maqsad)

Faqat shu yerda boshlanadi, chunki avvalgi beshtasisiz uni **sinab
bo'lmaydi**.

1. `expo-local-authentication` + app.json plugini
2. Sozlamada tugma: «PIN yoki barmoq izi bilan qulflash»
3. Qulf ekrani — ilova ochilganda va fonda N daqiqa turgandan keyin
4. **Zaxira yo'l** — qurilmada qulf yo'q bo'lsa sozlama ko'rinmaydi;
   autentifikatsiya yiqilsa parol bilan kirish qoladi. Qulf hech
   qachon yagona yo'l bo'lmasligi kerak, aks holda odam o'z
   daftaridan butunlay ajralib qoladi.
5. Sinovlar: `kassa-ui` (o'lik yo'l yo'qligi), `kassa-til` (ruscha)

Chaqiruvning o'zagi bitta parametr:

```js
await LocalAuthentication.authenticateAsync({
  promptMessage: tr('Clary ni ochish'),
  disableDeviceFallback: false,   // ← PIN va CHIZMA shu yerdan
});
```

`disableDeviceFallback: false` Android'da `BiometricPrompt` ni
`DEVICE_CREDENTIAL` bilan ochadi: barmoq izi bo'lsa — barmoq izi,
bo'lmasa PIN yoki chizma. Samsung Pass ham o'zi qo'shiladi.

---

## Xavflar

| Xavf | Nima qilamiz |
|---|---|
| `C:` da 5 GB — Gradle baribir vaqtinchalik fayl yozadi | `GRADLE_USER_HOME` ni `D:` ga olamiz, qurishdan keyin `C:` ni tekshiramiz |
| Umumiy yuklash ~2-4 GB | Faza 2 va 4 ni internet yaxshi paytda qilamiz |
| `cmdline-tools` papka tuzilishi | `latest\bin` bo'lishi shart — eng ko'p uchraydigan xato |
| Prebuild qo'lda o'zgartirishni yo'q qiladi | Imzo skript bilan qo'yiladi (Faza 3) |
| Noto'g'ri kalit bilan imzolash | `apksigner verify` bilan tekshiriladi (Faza 3) |

## Chegara

Bu reja **faqat Android** uchun. iOS mahalliy qurish macOS talab
qiladi va bu yerda imkonsiz — iOS kerak bo'lsa EAS orqali qoladi.
