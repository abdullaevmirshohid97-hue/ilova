// =============================================================
//  MCP ASBOBLARI — ta'rif va formatlash
//
//  Bu fayl BAZAGA TEGMAYDI: unda faqat asboblarning ro'yxati,
//  parametrlari va javobni matnga aylantirish turadi. Shuning
//  uchun uni sinovdan oddiy chaqirib ko'rish mumkin
//  (`index.ts` ichida `Deno.serve` bor — u import qilinmaydi).
//
//  ASBOB TA'RIFI — bu AI uchun QO'LLANMA. Agent nomdan va
//  izohdan tushunadi, shuning uchun izohlar odam uchun emas,
//  MODEL uchun yozilgan: qachon ishlatish va nima qaytishi.
// =============================================================

export type Asbob = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Bazaga yozadimi — faqat `yozishi` huquqli token uchun */
  yozadi?: boolean;
};

const DAVR = {
  type: 'string',
  enum: ['bugun', 'kecha', 'hafta', 'oy', 'yil', 'hammasi'],
  description: "Qaysi davr. Standart: 'oy'",
};

export const ASBOBLAR: Asbob[] = [
  {
    name: 'qoldiq_ol',
    title: 'Hisoblar qoldig‘i',
    description:
      'Barcha hisoblar (naqd, karta, bank) va ularning hozirgi qoldig‘i. ' +
      '"Qancha pulim bor?", "kassada qancha qoldi?" kabi savollarga shu javob beradi.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'yozuvlar_ol',
    title: 'Kirim-chiqim ro‘yxati',
    description:
      'Davr bo‘yicha kirim va chiqim yozuvlari ro‘yxati. ' +
      'Har yozuvda sana, turi, summa, turkum, kontakt va izoh bo‘ladi.',
    inputSchema: {
      type: 'object',
      properties: {
        davr: DAVR,
        turi: { type: 'string', enum: ['kirim', 'chiqim'], description: 'Faqat shu turdagilar' },
        chegara: { type: 'integer', minimum: 1, maximum: 200, description: 'Nechta qator. Standart 50' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'hisobot_ol',
    title: 'Davr hisoboti',
    description:
      'Davr uchun jami kirim, jami chiqim, farq va turkumlar kesimi. ' +
      '"Bu oy qancha ketdi?", "eng katta xarajatim nima?" degan savollarga shu javob beradi.',
    inputSchema: {
      type: 'object',
      properties: { davr: DAVR },
      additionalProperties: false,
    },
  },
  {
    name: 'qarzlar_ol',
    title: 'Qarzlar',
    description:
      'Mijoz va ta’minotchilarning qarz qoldig‘i. Musbat — bizga qarzdor, ' +
      'manfiy — oldindan to‘lagan. "Kim qancha qarz?" savoliga shu javob beradi.',
    inputSchema: {
      type: 'object',
      properties: {
        faqat: {
          type: 'string',
          enum: ['hammasi', 'qarzi', 'oldindan'],
          description: "Standart: 'qarzi' — faqat qarzi borlar",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'qidir',
    title: 'Yozuv qidirish',
    description:
      'Izoh, turkum yoki kontakt nomi bo‘yicha yozuv qidiradi. ' +
      '"Ijara uchun qancha to‘laganman?" kabi savollarda ishlatiladi.',
    inputSchema: {
      type: 'object',
      properties: {
        matn: { type: 'string', minLength: 2, description: 'Qidiruv so‘zi' },
        chegara: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['matn'],
      additionalProperties: false,
    },
  },
  {
    name: 'yozuv_yarat',
    title: 'Yangi yozuv',
    description:
      'Kirim yoki chiqim yozuvini yaratadi. MUHIM: `tasdiq` berilmasa hech narsa ' +
      'yozilmaydi — funksiya faqat nima yoziladiganini ko‘rsatadi. Foydalanuvchidan ' +
      'tasdiq olgandan KEYIN `tasdiq: true` bilan qayta chaqiring.',
    yozadi: true,
    inputSchema: {
      type: 'object',
      properties: {
        turi: { type: 'string', enum: ['kirim', 'chiqim'] },
        summa: { type: 'number', exclusiveMinimum: 0, description: 'So‘mda (tiyinsiz)' },
        izoh: { type: 'string', description: 'Nima uchun' },
        hisob: { type: 'string', description: 'Hisob nomi. Berilmasa — birinchi faol hisob' },
        turkum: { type: 'string', description: 'Turkum nomi (mavjudlaridan)' },
        kontakt: { type: 'string', description: 'Mijoz yoki ta’minotchi nomi' },
        sana: { type: 'string', description: 'ISO sana. Berilmasa — hozir' },
        tasdiq: { type: 'boolean', description: 'true bo‘lsagina bazaga yoziladi' },
      },
      required: ['turi', 'summa'],
      additionalProperties: false,
    },
  },

  // -------------------------------------------------------------
  //  OLDI-BERDI
  //
  //  Daftar yozuvi (kirim/chiqim) va hamkor bilan oldi-berdi —
  //  BOSHQA-BOSHQA narsa. Birinchisi kassadagi pul harakati,
  //  ikkinchisi «kim kimga qarzdor». Ilovada ikkalasi bor, MCP'da
  //  esa faqat birinchisi bor edi: agent bitim yozilganini
  //  ko'rmasdi va qarzni eskicha aytardi.
  // -------------------------------------------------------------
  {
    name: 'bitimlar_ol',
    title: 'Hamkor bilan oldi-berdi',
    description:
      'Bitta hamkor bilan bo‘lgan bitim va to‘lovlar tarixi, oxirida qoldiq. ' +
      'Musbat qoldiq — u sizga qarzdor, manfiy — siz unga.',
    inputSchema: {
      type: 'object',
      properties: {
        kontakt: { type: 'string', description: 'Hamkor ismi' },
        chegara: { type: 'number', description: 'Nechta qator (standart 40)' },
      },
      required: ['kontakt'],
      additionalProperties: false,
    },
  },
  {
    name: 'bitim_yarat',
    title: 'Yangi bitim',
    description:
      'Hamkor bilan oldi-berdi yozadi: tovar berdim/oldim yoki qarz berdim/oldim. ' +
      'MUHIM: `tasdiq` berilmasa hech narsa yozilmaydi — funksiya faqat nima ' +
      'yoziladiganini ko‘rsatadi. Foydalanuvchidan tasdiq olgandan KEYIN ' +
      '`tasdiq: true` bilan qayta chaqiring.',
    yozadi: true,
    inputSchema: {
      type: 'object',
      properties: {
        kontakt: { type: 'string', description: 'Hamkor ismi. Yo‘q bo‘lsa yaratiladi' },
        yonalish: {
          type: 'string',
          enum: ['berdim', 'oldim'],
          description: 'berdim — u menga qarzdor bo‘ladi; oldim — men unga',
        },
        nima: { type: 'string', enum: ['tovar', 'qarz'] },
        summa: { type: 'number', exclusiveMinimum: 0, description: 'So‘mda (tiyinsiz)' },
        tovar_nom: { type: 'string', description: 'nima=tovar bo‘lsa SHART' },
        miqdor: { type: 'number', exclusiveMinimum: 0 },
        birlik: { type: 'string', description: 'dona, kg, metr…' },
        muddat: { type: 'string', description: 'To‘lov muddati, ISO sana' },
        valyuta: { type: 'string', description: 'Standart — hamkorning valyutasi' },
        izoh: { type: 'string' },
        sana: { type: 'string', description: 'ISO sana. Berilmasa — hozir' },
        tasdiq: { type: 'boolean', description: 'true bo‘lsagina bazaga yoziladi' },
      },
      required: ['kontakt', 'yonalish', 'nima', 'summa'],
      additionalProperties: false,
    },
  },
  {
    name: 'tolov_yarat',
    title: 'Qarzga to‘lov',
    description:
      'Hamkor qarzini kamaytiradigan to‘lov yozadi. `tasdiq` berilmasa hech narsa ' +
      'yozilmaydi.',
    yozadi: true,
    inputSchema: {
      type: 'object',
      properties: {
        kontakt: { type: 'string', description: 'Hamkor ismi' },
        yonalish: {
          type: 'string',
          enum: ['oldim', 'berdim'],
          description: 'oldim — u menga to‘ladi; berdim — men unga to‘ladim',
        },
        summa: { type: 'number', exclusiveMinimum: 0, description: 'So‘mda (tiyinsiz)' },
        usuli: { type: 'string', enum: ['naqd', 'karta', 'bank', 'tovar'] },
        izoh: { type: 'string' },
        sana: { type: 'string', description: 'ISO sana. Berilmasa — hozir' },
        tasdiq: { type: 'boolean', description: 'true bo‘lsagina bazaga yoziladi' },
      },
      required: ['kontakt', 'yonalish', 'summa'],
      additionalProperties: false,
    },
  },
  {
    name: 'valyutalar_ol',
    title: 'Valyuta va kurs',
    description:
      'Tashkilotning asosiy valyutasi va qo‘shimcha valyutalar kursi. Summani ' +
      'boshqa valyutada aytishdan oldin shu kursni oling — taxmin qilmang.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

// ---------------------------------------------------------------
//  Formatlash — javob AI uchun ham, odam uchun ham o'qilsin
// ---------------------------------------------------------------

/** Ming ajratgichli son. `Intl` ishlatilmaydi — muhitga bog'liq bo'lardi. */
export function son(n: number): string {
  const x = Math.round(n);
  const belgi = x < 0 ? '-' : '';
  return belgi + Math.abs(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function pul(tiyin: number, valyuta = 'UZS'): string {
  const som = tiyin / 100;
  const belgi = valyuta === 'USD' ? '$' : valyuta === 'UZS' ? " so'm" : ' ' + valyuta;
  return valyuta === 'USD' ? belgi + son(som) : son(som) + belgi;
}

export type Oraliq = { bosh: Date; oxir: Date; nom: string };

/**
 * Davr nomidan sana oralig'i. Mijoz tomondagi `davr.ts` bilan bir xil
 * mantiq, lekin bu yerda serverda kerak — MCP mijozining soatiga
 * ishonib bo'lmaydi.
 */
export function oraliq(davr = 'oy'): Oraliq {
  const hozir = new Date();
  const kunBoshi = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const kunOxiri = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (davr === 'hammasi') {
    return { bosh: new Date(2000, 0, 1), oxir: new Date(2999, 11, 31), nom: 'butun davr' };
  }
  if (davr === 'bugun') return { bosh: kunBoshi(hozir), oxir: kunOxiri(hozir), nom: 'bugun' };
  if (davr === 'kecha') {
    const k = new Date(hozir);
    k.setDate(k.getDate() - 1);
    return { bosh: kunBoshi(k), oxir: kunOxiri(k), nom: 'kecha' };
  }
  if (davr === 'hafta') {
    const b = new Date(hozir);
    b.setDate(b.getDate() - ((b.getDay() + 6) % 7));
    return { bosh: kunBoshi(b), oxir: kunOxiri(hozir), nom: 'shu hafta' };
  }
  if (davr === 'yil') {
    return {
      bosh: new Date(hozir.getFullYear(), 0, 1),
      oxir: kunOxiri(hozir),
      nom: `${hozir.getFullYear()}-yil`,
    };
  }
  return {
    bosh: new Date(hozir.getFullYear(), hozir.getMonth(), 1),
    oxir: kunOxiri(hozir),
    nom: 'shu oy',
  };
}

/** MCP javobi: matn + mashina o'qiy oladigan JSON */
export function javob(matn: string, malumot?: unknown) {
  const qismlar: { type: 'text'; text: string }[] = [{ type: 'text', text: matn }];
  if (malumot !== undefined) {
    qismlar.push({ type: 'text', text: '```json\n' + JSON.stringify(malumot, null, 2) + '\n```' });
  }
  return { content: qismlar };
}

export function xatoJavob(matn: string) {
  return { content: [{ type: 'text' as const, text: matn }], isError: true };
}
