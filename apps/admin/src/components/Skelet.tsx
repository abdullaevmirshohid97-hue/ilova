// ============================================================================
// SKELETON — yuklanish holati
//
// Avval sahifa ma'lumot kelguncha bo'sh turardi va o'rtada "Yuklanmoqda..."
// deb yozilardi. Sekin internetda bu "ilova qotib qoldi"dek ko'rinadi:
// ekranda hech narsa yo'q, harakat ham yo'q.
//
// Skeleton kutilayotgan tarkibning SHAKLINI darhol ko'rsatadi — jadval
// bo'lsa qatorlar, kartochka bo'lsa kartochka. Odam nima kelayotganini
// biladi va sahifa "tirik" ko'rinadi.
//
// prefers-reduced-motion: harakat kamaytirilgan bo'lsa pulsatsiya
// o'chadi, shakl esa qoladi.
// ============================================================================

function Chiziq({ kenglik = 'w-full', balandlik = 'h-4' }: { kenglik?: string; balandlik?: string }) {
  return (
    <div
      className={`${kenglik} ${balandlik} rounded bg-gray-200 motion-safe:animate-pulse`}
      aria-hidden="true"
    />
  );
}

/** Jadval skeleti — ustun soni va qator soni beriladi */
export function JadvalSkelet({ ustun = 5, qator = 6 }: { ustun?: number; qator?: number }) {
  // Ustunlar bir xil kenglikda bo'lsa jadval sun'iy ko'rinadi. Birinchi
  // ustun kengroq (odatda nom), oxirgisi torroq (odatda son).
  const kengliklar = ['w-40', 'w-24', 'w-28', 'w-20', 'w-16', 'w-24', 'w-20'];

  return (
    <div className="overflow-hidden" role="status" aria-label="Yuklanmoqda">
      <div className="flex gap-4 border-b border-gray-100 px-5 py-3">
        {Array.from({ length: ustun }).map((_, i) => (
          <Chiziq key={i} kenglik={kengliklar[i % kengliklar.length]} balandlik="h-3" />
        ))}
      </div>
      {Array.from({ length: qator }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-gray-50 px-5 py-4">
          {Array.from({ length: ustun }).map((_, i) => (
            <Chiziq key={i} kenglik={kengliklar[i % kengliklar.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Ko'rsatkich kartochkalari (KPI qatori) */
export function KartochkaSkelet({ soni = 3 }: { soni?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Yuklanmoqda">
      {Array.from({ length: soni }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5">
          <Chiziq kenglik="w-24" balandlik="h-3" />
          <div className="mt-3">
            <Chiziq kenglik="w-32" balandlik="h-7" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matn bloki — tafsilot sahifalari uchun */
export function MatnSkelet({ qator = 4 }: { qator?: number }) {
  const kengliklar = ['w-full', 'w-5/6', 'w-4/6', 'w-3/4'];
  return (
    <div className="space-y-3" role="status" aria-label="Yuklanmoqda">
      {Array.from({ length: qator }).map((_, i) => (
        <Chiziq key={i} kenglik={kengliklar[i % kengliklar.length]} />
      ))}
    </div>
  );
}
