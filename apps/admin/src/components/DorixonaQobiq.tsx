import { useEffect } from 'react';
import { C, MONO, temaCssniUlash, temaniOl } from '../lib/sa-tema';

// ============================================================================
// DORIXONA QOBIG'I
//
// Dorixona ekranlari super admin konsoli uchun yozilgan: ranglari
// `sa-tema` dagi CSS o'zgaruvchilaridan (`var(--sa-bg)` va hokazo)
// olinadi. Ular esa `data-sa-tema` atributi turgan element ICHIDA
// qiymatga ega bo'ladi.
//
// Konsolda bu atribut butun sahifaga qo'yilardi. Tenant panelida
// undqy qilib bo'lmaydi: qolgan sahifalar (buyurtma, mahsulot,
// moliya) o'zining yorug' dizaynida qolishi kerak. Shuning uchun
// atribut FAQAT shu qobiqqa qo'yiladi — o'zgaruvchilar shu daraxtda
// ishlaydi, tashqarisi tegilmaydi.
//
// CSS `head` ga bir marta ulanadi (`temaCssniUlash` o'zi tekshiradi).
// Qobiqsiz ekran ochilsa hamma rang aniqlanmagan bo'lib qolardi va
// matn oq fonda oq chiqardi — buni faqat ko'z bilan sezish mumkin
// edi, shuning uchun qobiq alohida komponent.
// ============================================================================

export default function DorixonaQobiq({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    temaCssniUlash();
  }, []);

  return (
    // Manfiy chet — `Layout` ning `main` i allaqachon p-4/md:p-8 beradi.
    // Uni qoplamasak, qorong'i konsol oq ramka ichida turgandek
    // ko'rinardi. Endi u butun maydonni to'ldiradi.
    <div
      data-sa-tema={temaniOl()}
      className="-m-4 p-4 md:-m-8 md:p-8"
      style={{
        background: C.bg,
        color: C.text,
        fontFamily: MONO,
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  );
}
