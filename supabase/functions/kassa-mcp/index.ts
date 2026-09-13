// =============================================================
//  CREDIT DEBIT — MCP SERVERI
//
//  AI agent (telefondagi yordamchi, Claude va boshqa MCP mijozlari)
//  foydalanuvchining daftariga ULANADI va savolga javob beradi:
//  «qancha pulim bor?», «bu oy qancha ketdi?», «kim qancha qarz?».
//
//  PROTOKOL: MCP — JSON-RPC 2.0, HTTP ustidan. Uchta usul yetadi:
//  `initialize`, `tools/list`, `tools/call`. Bildirishnomalar
//  (id'siz xabarlar) 202 bilan javobsiz qaytadi — spetsifikatsiya
//  shuni talab qiladi.
//
//  XAVFSIZLIK — bu ochiq internetdagi eshik, shuning uchun:
//
//   1. `service_role` bilan ishlaydi, ya'ni RLS CHETLAB O'TILADI.
//      Demak HAR bir so'rovda `org_id` filtri QO'LDA yozilgan.
//      `tests/kassa-mcp.mjs` boshqa tenantni ko'rishga urinadi.
//   2. Token EGASINING tashkilotiga bog'langan va xesh bo'yicha
//      topiladi — token matni bazada yo'q.
//   3. YOZISH standart holatda YOPIQ. Token `yozishi = true` bilan
//      berilmasa, agent faqat o'qiy oladi.
//   4. Yozish tasdiqsiz bo'lmaydi: `tasdiq: true` kelmasa, funksiya
//      nima yoziladiganini ko'rsatadi va hech narsa yozmaydi.
//      (CLAUDE.md 1-qoidasi: jonli ma'lumotga yozishdan oldin
//      quruq sinov.)
//   5. Kunlik chegara: bir tenant kuniga 500 so'rov. Busiz bitta
//      sikldagi agent hisobni bo'shatardi.
//
//  verify_jwt = FALSE bo'lishi SHART: MCP mijozi Supabase JWT'sini
//  emas, o'zimizning `cd_...` tokenimizni yuboradi.
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ASBOBLAR, javob, oraliq, pul, son, xatoJavob } from './asboblar.ts';

const KUNLIK_CHEGARA = 500;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function rpcXato(id: unknown, kod: number, xabar: string) {
  return json({ jsonrpc: '2.0', id: id ?? null, error: { code: kod, message: xabar } });
}

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceKey);

type Egasi = { token_id: string; org_id: string; user_id: string; yozishi: boolean; nom: string };

async function egasiniTop(req: Request): Promise<Egasi | null> {
  const sarlavha = req.headers.get('Authorization') ?? '';
  const token = sarlavha.replace(/^Bearer\s+/i, '').trim();
  if (!token.startsWith('cd_')) return null;
  const { data } = await admin.rpc('kassa_token_tekshir', { p_token: token });
  return (data as Egasi) ?? null;
}

async function jurnal(e: Egasi, asbob: string, natija: 'ok' | 'rad' | 'xato', izoh?: string) {
  await admin.from('kassa_mcp_jurnal').insert({
    org_id: e.org_id,
    token_id: e.token_id,
    asbob,
    natija,
    izoh: izoh?.slice(0, 300) ?? null,
  });
}

// =============================================================
//  Ma'lumot o'qish — hammasi org_id bilan cheklangan
// =============================================================
const t = (x: unknown) => Math.round(Number(x ?? 0) * 100); // "1234.56" -> tiyin

async function hisoblar(org: string) {
  const { data } = await admin
    .from('kassa_hisoblar')
    .select('id, nom, valyuta, boshlangich, faol, tartib')
    .eq('org_id', org)
    .order('tartib');
  return data ?? [];
}

async function yozuvlar(org: string, bosh: Date, oxir: Date, chegara = 500) {
  const { data } = await admin
    .from('kassa_yozuvlar')
    .select('id, hisob_id, turi, summa, turkum_id, klient_id, izoh, sana, kochirma_id, bekor_at')
    .eq('org_id', org)
    .gte('sana', bosh.toISOString())
    .lte('sana', oxir.toISOString())
    .order('sana', { ascending: false })
    .limit(chegara);
  return (data ?? []).filter((y) => !y.bekor_at);
}

async function nomlar(org: string) {
  const [{ data: turkumlar }, { data: klientlar }, h] = await Promise.all([
    admin.from('kassa_turkumlar').select('id, nom, turi').eq('org_id', org),
    admin.from('kassa_klientlar').select('id, ism, turi').eq('org_id', org),
    hisoblar(org),
  ]);
  return {
    turkum: new Map((turkumlar ?? []).map((x) => [x.id, x.nom])),
    klient: new Map((klientlar ?? []).map((x) => [x.id, x.ism])),
    hisob: new Map(h.map((x) => [x.id, x.nom])),
    turkumRoyxat: turkumlar ?? [],
    klientRoyxat: klientlar ?? [],
    hisobRoyxat: h,
  };
}

// =============================================================
//  Asboblar
// =============================================================
async function asbobniBajar(e: Egasi, nom: string, arg: Record<string, unknown>) {
  const org = e.org_id;

  if (nom === 'qoldiq_ol') {
    const h = await hisoblar(org);
    const y = await yozuvlar(org, new Date(2000, 0, 1), new Date(2999, 0, 1), 5000);
    const qatorlar = h
      .filter((x) => x.faol !== false)
      .map((x) => {
        const qoldiq =
          t(x.boshlangich) +
          y
            .filter((z) => z.hisob_id === x.id)
            .reduce((s, z) => s + (z.turi === 'kirim' ? t(z.summa) : -t(z.summa)), 0);
        return { hisob: x.nom, valyuta: x.valyuta, qoldiq_som: qoldiq / 100 };
      });
    const jami = qatorlar
      .filter((x) => x.valyuta === 'UZS')
      .reduce((s, x) => s + x.qoldiq_som, 0);
    const matn =
      qatorlar.map((x) => `${x.hisob}: ${pul(x.qoldiq_som * 100, x.valyuta)}`).join('\n') +
      (qatorlar.length > 1 ? `\n\nJami (UZS): ${son(jami)} so'm` : '');
    return javob(matn || 'Hisob yo‘q', qatorlar);
  }

  if (nom === 'yozuvlar_ol') {
    const o = oraliq(String(arg.davr ?? 'oy'));
    const chegara = Math.min(Number(arg.chegara ?? 50), 200);
    const n = await nomlar(org);
    let y = await yozuvlar(org, o.bosh, o.oxir, 500);
    if (arg.turi) y = y.filter((x) => x.turi === arg.turi);
    y = y.slice(0, chegara);
    const qatorlar = y.map((x) => ({
      sana: String(x.sana).slice(0, 10),
      turi: x.turi,
      summa_som: t(x.summa) / 100,
      hisob: n.hisob.get(x.hisob_id) ?? '',
      turkum: x.turkum_id ? (n.turkum.get(x.turkum_id) ?? '') : '',
      kontakt: x.klient_id ? (n.klient.get(x.klient_id) ?? '') : '',
      izoh: x.izoh ?? '',
      otkazma: !!x.kochirma_id,
    }));
    const matn =
      `${o.nom}: ${qatorlar.length} ta yozuv\n` +
      qatorlar
        .slice(0, 30)
        .map(
          (x) =>
            `${x.sana}  ${x.turi === 'kirim' ? '+' : '−'}${son(x.summa_som)}  ${x.izoh || x.turkum || ''}`,
        )
        .join('\n');
    return javob(matn, qatorlar);
  }

  if (nom === 'hisobot_ol') {
    const o = oraliq(String(arg.davr ?? 'oy'));
    const n = await nomlar(org);
    const y = (await yozuvlar(org, o.bosh, o.oxir, 5000)).filter((x) => !x.kochirma_id);
    let kirim = 0;
    let chiqim = 0;
    const turkumlar = new Map<string, number>();
    for (const x of y) {
      const s = t(x.summa);
      if (x.turi === 'kirim') kirim += s;
      else chiqim += s;
      const kalit = (x.turkum_id ? (n.turkum.get(x.turkum_id) ?? 'Turkumsiz') : 'Turkumsiz') +
        (x.turi === 'kirim' ? ' (kirim)' : '');
      turkumlar.set(kalit, (turkumlar.get(kalit) ?? 0) + s);
    }
    const kesim = [...turkumlar.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nomi, summa]) => ({ turkum: nomi, summa_som: summa / 100 }));
    const matn =
      `${o.nom} hisoboti\n` +
      `Kirim:  ${son(kirim / 100)}\n` +
      `Chiqim: ${son(chiqim / 100)}\n` +
      `Farq:   ${son((kirim - chiqim) / 100)}\n\n` +
      kesim
        .slice(0, 10)
        .map((x) => `  ${x.turkum}: ${son(x.summa_som)}`)
        .join('\n');
    return javob(matn, {
      davr: o.nom,
      kirim_som: kirim / 100,
      chiqim_som: chiqim / 100,
      farq_som: (kirim - chiqim) / 100,
      turkumlar: kesim,
    });
  }

  if (nom === 'qarzlar_ol') {
    const faqat = String(arg.faqat ?? 'qarzi');
    const n = await nomlar(org);
    const y = await yozuvlar(org, new Date(2000, 0, 1), new Date(2999, 0, 1), 5000);
    const qatorlar = n.klientRoyxat
      .map((k) => {
        const qarz = y
          .filter((z) => z.klient_id === k.id)
          .reduce((s, z) => s + (z.turi === 'chiqim' ? t(z.summa) : -t(z.summa)), 0);
        return { kontakt: k.ism, turi: k.turi, qarz_som: qarz / 100 };
      })
      .filter((x) => (faqat === 'qarzi' ? x.qarz_som > 0 : faqat === 'oldindan' ? x.qarz_som < 0 : true))
      .sort((a, b) => Math.abs(b.qarz_som) - Math.abs(a.qarz_som));
    const olamiz = qatorlar.filter((x) => x.qarz_som > 0).reduce((s, x) => s + x.qarz_som, 0);
    const beramiz = qatorlar.filter((x) => x.qarz_som < 0).reduce((s, x) => s - x.qarz_som, 0);
    const matn =
      qatorlar.map((x) => `${x.kontakt}: ${son(Math.abs(x.qarz_som))} ${x.qarz_som > 0 ? '(qarzi)' : '(oldindan)'}`).join('\n') +
      `\n\nBizga qarzdor: ${son(olamiz)}\nBiz qarzdormiz: ${son(beramiz)}`;
    return javob(qatorlar.length ? matn : 'Qarzi bor kontakt yo‘q', qatorlar);
  }

  if (nom === 'qidir') {
    const matnQidir = String(arg.matn ?? '').toLowerCase();
    if (matnQidir.length < 2) return xatoJavob('Qidiruv so‘zi juda qisqa');
    const chegara = Math.min(Number(arg.chegara ?? 30), 100);
    const n = await nomlar(org);
    const y = await yozuvlar(org, new Date(2000, 0, 1), new Date(2999, 0, 1), 2000);
    const topilgan = y
      .filter((x) => {
        const turkum = x.turkum_id ? (n.turkum.get(x.turkum_id) ?? '') : '';
        const klient = x.klient_id ? (n.klient.get(x.klient_id) ?? '') : '';
        return (
          (x.izoh ?? '').toLowerCase().includes(matnQidir) ||
          turkum.toLowerCase().includes(matnQidir) ||
          klient.toLowerCase().includes(matnQidir)
        );
      })
      .slice(0, chegara)
      .map((x) => ({
        sana: String(x.sana).slice(0, 10),
        turi: x.turi,
        summa_som: t(x.summa) / 100,
        izoh: x.izoh ?? '',
      }));
    const jami = topilgan.reduce((s, x) => s + (x.turi === 'chiqim' ? x.summa_som : 0), 0);
    return javob(
      `«${arg.matn}» bo‘yicha ${topilgan.length} ta yozuv topildi. Chiqim jami: ${son(jami)}`,
      topilgan,
    );
  }

  if (nom === 'yozuv_yarat') {
    if (!e.yozishi) {
      return xatoJavob(
        'Bu ulanish faqat O‘QISH uchun. Yozish uchun ilovada yangi token yarating va «yozishi mumkin» belgisini qo‘ying.',
      );
    }
    const turi = arg.turi === 'kirim' ? 'kirim' : 'chiqim';
    const summa = Number(arg.summa);
    if (!Number.isFinite(summa) || summa <= 0) return xatoJavob('Summa noto‘g‘ri');

    const n = await nomlar(org);
    const hisob =
      n.hisobRoyxat.find((h) => arg.hisob && h.nom.toLowerCase() === String(arg.hisob).toLowerCase()) ??
      n.hisobRoyxat.find((h) => h.faol !== false);
    if (!hisob) return xatoJavob('Hisob topilmadi');

    const turkum = arg.turkum
      ? n.turkumRoyxat.find(
          (x) => x.turi === turi && x.nom.toLowerCase() === String(arg.turkum).toLowerCase(),
        )
      : null;
    const klient = arg.kontakt
      ? n.klientRoyxat.find((x) => x.ism.toLowerCase() === String(arg.kontakt).toLowerCase())
      : null;

    const korinish =
      `${turi === 'kirim' ? 'KIRIM' : 'CHIQIM'}\n` +
      `Summa:  ${son(summa)} so'm\n` +
      `Hisob:  ${hisob.nom}\n` +
      (turkum ? `Turkum: ${turkum.nom}\n` : arg.turkum ? `Turkum: «${arg.turkum}» topilmadi — bo'sh qoladi\n` : '') +
      (klient ? `Kontakt: ${klient.ism}\n` : arg.kontakt ? `Kontakt: «${arg.kontakt}» topilmadi — bo'sh qoladi\n` : '') +
      (arg.izoh ? `Izoh:   ${arg.izoh}\n` : '');

    // QURUQ SINOV: tasdiq bo'lmasa hech narsa yozilmaydi
    if (arg.tasdiq !== true) {
      return javob(
        korinish +
          '\nHech narsa YOZILMADI. Foydalanuvchidan tasdiq oling va shu chaqiruvni ' +
          '`tasdiq: true` bilan takrorlang.',
        { tasdiq_kerak: true },
      );
    }

    const { error } = await admin.from('kassa_yozuvlar').insert({
      org_id: org,
      hisob_id: hisob.id,
      turi,
      summa: summa.toFixed(2),
      valyuta: hisob.valyuta ?? 'UZS',
      turkum_id: turkum?.id ?? null,
      klient_id: klient?.id ?? null,
      izoh: arg.izoh ? String(arg.izoh).slice(0, 300) : 'AI agent orqali',
      sana: arg.sana ? String(arg.sana) : new Date().toISOString(),
    });
    if (error) return xatoJavob('Yozilmadi: ' + error.message);

    return javob(korinish + '\n✓ Yozuv qo‘shildi.', { yozildi: true });
  }

  return xatoJavob('Noma’lum asbob: ' + nom);
}

// =============================================================
//  HTTP
// =============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // MCP mijozlari ba'zan GET bilan SSE oqimini so'raydi. Bizda
  // server o'zidan xabar yubormaydi, shuning uchun ochiq aytamiz.
  if (req.method === 'GET') {
    return json({ xabar: 'Credit Debit MCP serveri. POST orqali JSON-RPC yuboring.' }, 405);
  }
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  let xabar: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    xabar = await req.json();
  } catch {
    return rpcXato(null, -32700, 'JSON o‘qib bo‘lmadi');
  }

  const { id, method, params } = xabar;
  const bildirishnoma = id === undefined || id === null;

  // `initialize` tokensiz ham javob beradi: mijoz avval qo'l beradi,
  // keyin asboblarni so'raydi. Lekin ASBOBLAR va CHAQIRUV — tokensiz yo'q.
  if (method === 'initialize') {
    return json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'credit-debit', title: 'Credit Debit', version: '1.0.0' },
        instructions:
          'Bu — foydalanuvchining hisob-kitob daftari (Credit Debit). Pul, qarz va ' +
          'hisobot savollariga shu yerdagi asboblar bilan javob bering. Yozuv ' +
          'yaratishdan oldin FOYDALANUVCHIDAN TASDIQ oling: `yozuv_yarat` ni avval ' +
          'tasdiqsiz chaqiring, natijani ko‘rsating, keyin `tasdiq: true` bilan takrorlang.',
      },
    });
  }

  if (method === 'ping') return json({ jsonrpc: '2.0', id, result: {} });
  if (bildirishnoma) return new Response(null, { status: 202, headers: cors });

  const egasi = await egasiniTop(req);
  if (!egasi) {
    return rpcXato(id, -32001, 'Token yo‘q yoki yaroqsiz. Ilovadagi «AI ulanish» bo‘limidan token oling.');
  }

  if (method === 'tools/list') {
    return json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: ASBOBLAR.filter((a) => !a.yozadi || egasi.yozishi).map((a) => ({
          name: a.name,
          title: a.title,
          description: a.description,
          inputSchema: a.inputSchema,
        })),
      },
    });
  }

  if (method === 'tools/call') {
    const nom = String(params?.name ?? '');
    const arg = (params?.arguments ?? {}) as Record<string, unknown>;

    const { data: soni } = await admin.rpc('kassa_mcp_hisob', { p_org: egasi.org_id });
    if (Number(soni ?? 0) >= KUNLIK_CHEGARA) {
      await jurnal(egasi, nom, 'rad', 'kunlik chegara');
      return json({
        jsonrpc: '2.0',
        id,
        result: xatoJavob(`Kunlik chegara (${KUNLIK_CHEGARA} so‘rov) tugadi. Ertaga qayta urinib ko‘ring.`),
      });
    }

    try {
      const natija = await asbobniBajar(egasi, nom, arg);
      await jurnal(egasi, nom, (natija as { isError?: boolean }).isError ? 'rad' : 'ok');
      return json({ jsonrpc: '2.0', id, result: natija });
    } catch (err) {
      await jurnal(egasi, nom, 'xato', String((err as Error)?.message ?? err));
      return json({ jsonrpc: '2.0', id, result: xatoJavob('Xatolik: ' + String((err as Error)?.message ?? err)) });
    }
  }

  return rpcXato(id, -32601, 'Noma’lum usul: ' + method);
});
