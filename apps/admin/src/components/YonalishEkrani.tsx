import { supabase } from '../lib/supabase';
import type { TenantYonalish } from '../lib/yonalishlar';

// ============================================================================
// Tenant panelining birinchi ekrani — qaysi tizimda ishlash tanlanadi.
//
// Bu yerda faqat SHU tenantga berilgan yo'nalishlar ko'rinadi. Ro'yxatni
// super admin belgilaydi (organizations.yonalishlar), tenant o'zi
// o'zgartira olmaydi.
// ============================================================================

export function YonalishEkrani({
  yonalishlar,
  onTanla,
}: {
  yonalishlar: TenantYonalish[];
  onTanla: (y: TenantYonalish) => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <div className="text-lg font-extrabold tracking-wide text-navy">YUKCHIBOLLA</div>
          <div className="text-xs text-gray-500">Administrator</div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
        >
          Chiqish
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-xl font-bold text-gray-900">Tizimni tanlang</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sizga berilgan yo‘nalishlar. Yangi yo‘nalish kerak bo‘lsa administratorga murojaat qiling.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {yonalishlar.map((y) => {
            const ochiq = y.modullar.length > 0;
            return (
              <button
                key={y.key}
                onClick={() => ochiq && onTanla(y)}
                disabled={!ochiq}
                className={`rounded-2xl border bg-white p-5 text-left transition ${
                  ochiq
                    ? 'border-gray-200 hover:border-navy hover:shadow-md'
                    : 'cursor-default border-dashed border-gray-200 opacity-60'
                }`}
              >
                <div className="text-3xl">{y.belgi}</div>
                <div className="mt-3 text-base font-bold text-gray-900">{y.nom}</div>
                <div className="mt-1 text-sm text-gray-500">{y.izoh}</div>

                {ochiq ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {y.modullar.slice(0, 5).map((m) => (
                      <span
                        key={m.to}
                        className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600"
                      >
                        {m.label}
                      </span>
                    ))}
                    {y.modullar.length > 5 && (
                      <span className="rounded-lg px-2 py-1 text-xs text-gray-500">
                        +{y.modullar.length - 5}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 inline-block rounded-lg border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500">
                    TEZ ORADA
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {yonalishlar.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <div className="text-3xl">🔒</div>
            <div className="mt-3 font-bold text-gray-900">Sizga hali tizim berilmagan</div>
            <div className="mt-1 text-sm text-gray-500">
              Administrator yo‘nalish belgilagach shu yerda ko‘rinadi.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Noto'g'ri manzil ogohlantirishi.
//
// Ikki manzil ikki ish uchun: 4020.yukchibolla.com — super admin konsoli,
// admin.yukchibolla.com — tenantlar paneli. Ikkalasi bitta fayldan
// yuklanadi, shuning uchun ajratish shu yerda.
//
// MUHIM: bu QULAYLIK uchun, himoya uchun emas. Haqiqiy himoya bazada:
// tenant admin super admin funksiyalarini chaqirolmaydi (is_super_admin()),
// super admin ma'lumotlari esa RLS bilan yopilgan. Manzilni almashtirib
// qo'yish hech kimga ortiqcha huquq bermaydi.
// ============================================================================

export function NotogriManzil({ kerakli, nima }: { kerakli: string; nima: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <div className="text-4xl">↪</div>
        <h1 className="mt-4 text-lg font-bold text-gray-900">Boshqa manzil</h1>
        <p className="mt-2 text-sm text-gray-500">{nima}</p>
        <a
          href={`https://${kerakli}`}
          className="mt-6 inline-block rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white"
        >
          {kerakli} ga o‘tish
        </a>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-3 block w-full rounded-xl px-5 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50"
        >
          Chiqish
        </button>
      </div>
    </div>
  );
}
