import { formatDate, formatSum, formatUsd } from './supabase';
import { altbilgi, blank, hujjatniYoz, imzo, logoniOl, oynaOch, sozlamaniOl, uslub } from './hujjat';

// Faktura bitta joyda yasaladi — admin ham, menejer ham AYNAN shu
// ko'rinishni ochadi. Farqi faqat narxda: admin sahifasi baza (rasmiy)
// narxni uzatadi, menejer esa o'z narxini — chunki qaysi narx ko'rinishini
// chaqiruvchi sahifa hal qiladi, bu fayl emas.
//
// Valyuta ham shunday: menejer mijozni dollarda savdo qilsa, sahifa
// currency='USD' va dollardagi narxlarni (order_items.orig_price) uzatadi.
// Baza narx doim so'mda, shuning uchun admin sahifasi valyuta bermaydi.
//
// Ko'rinish (qog'oz, shrift, logo, ustunlar) endi bu faylda emas —
// u tenantning sozlamasidan keladi, lib/hujjat.ts ga qarang.

export type InvoiceItem = {
  qty: number;
  unit_price: number;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  image: string | null;
};

export type InvoiceOrder = {
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  customer: string;
  phone: string;
  items: InvoiceItem[];
  currency?: 'UZS' | 'USD';
  // Dollarli fakturada so'mdagi ekvivalent — qarz (ledger) shu bo'yicha
  // yuritilgani uchun pastda kichik yozuv bilan ko'rsatiladi
  totalUzs?: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'YANGI — TASDIQLANMAGAN',
  confirmed: 'QABUL QILINGAN',
  picking: "YIG'ILMOQDA",
  done: 'YOPILGAN',
  cancelled: 'BEKOR QILINGAN',
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

// Faktura HAR QANDAY holatdagi buyurtma uchun ochiladi (yopilgani ham,
// hali tasdiqlanmagani ham). Tasdiqlanmaganida yuqorida ogohlantirish
// chiqadi, chunki narx/miqdor hali o'zgarishi mumkin.
export async function openInvoice(o: InvoiceOrder, orgName: string) {
  // Oyna DARHOL ochiladi — await'dan keyin ochilsa brauzer bloklaydi
  const w = oynaOch();
  if (!w) return;

  const s = await sozlamaniOl();
  const logo = await logoniOl(s);

  const tasdiqlanmagan = o.status === 'new' || o.status === 'cancelled';
  const usd = o.currency === 'USD';
  const pul = (n: number) => (usd ? formatUsd(n) : formatSum(n));

  // Ustunlar sozlamadan: rasmsiz faktura tezroq chiqadi va siyoh kam ketadi
  const rasmBor = s.ustun_rasm !== false;
  const skuBor = s.ustun_sku !== false;
  const razmerBor = s.ustun_razmer !== false;

  const sarlavhalar = [
    '<th style="width:26px">№</th>',
    rasmBor ? '<th style="width:52px">Rasm</th>' : '',
    '<th>Mahsulot</th>',
    razmerBor ? '<th>Razmer / Rang</th>' : '',
    '<th class="num">Miqdor</th>',
    '<th class="num">Narx</th>',
    '<th class="num">Summa</th>',
  ].join('');

  const ustunSoni = 4 + (rasmBor ? 1 : 0) + (razmerBor ? 1 : 0);

  const qatorlar = o.items
    .map((it, i) => {
      const rasm = rasmBor
        ? it.image
          ? `<td><img src="${esc(it.image)}" style="width:42px;height:42px;object-fit:cover;border-radius:4px;display:block" /></td>`
          : '<td><div style="width:42px;height:42px;border-radius:4px;background:#f0f0f4"></div></td>'
        : '';
      const razmer = razmerBor
        ? `<td>${esc([it.size, it.color].filter(Boolean).join(' / ') || '—')}</td>`
        : '';
      const nom = skuBor
        ? `<td><b>${esc(it.name)}</b><div style="color:#888;font-size:.85em">${esc(it.sku)}</div></td>`
        : `<td><b>${esc(it.name)}</b></td>`;
      return `<tr>
        <td>${i + 1}</td>${rasm}${nom}${razmer}
        <td class="num">${it.qty}</td>
        <td class="num">${pul(it.unit_price)}</td>
        <td class="num">${pul(it.unit_price * it.qty)}</td>
      </tr>`;
    })
    .join('');

  const tana = `
    ${blank(s, orgName, logo, {
      turi: 'Faktura',
      raqam: o.order_number,
      sana: formatDate(o.created_at),
      ostki: 'Ulgurji savdo',
    })}

    ${
      tasdiqlanmagan
        ? `<div class="ogoh">⚠ ${STATUS_LABEL[o.status] ?? esc(o.status)} — bu faktura yakuniy emas, miqdor va summa hali o'zgarishi mumkin.</div>`
        : ''
    }

    <div class="meta">
      <div><span class="yorliq">Mijoz</span><br><b>${esc(o.customer)}</b></div>
      <div><span class="yorliq">Telefon</span><br><b>${esc(o.phone ?? '—')}</b></div>
      <div><span class="yorliq">Holat</span><br><b>${STATUS_LABEL[o.status] ?? esc(o.status)}</b></div>
    </div>

    <table>
      <thead><tr>${sarlavhalar}</tr></thead>
      <tbody>${qatorlar}</tbody>
      <tfoot><tr>
        <td colspan="${ustunSoni}" class="num">JAMI</td>
        <td class="num">${pul(o.total)}</td>
      </tr></tfoot>
    </table>

    ${
      usd && o.totalUzs != null
        ? `<div style="margin-top:6px;text-align:right;color:#777">Kurs bo'yicha: <b>${formatSum(o.totalUzs)}</b></div>`
        : ''
    }

    ${imzo(s)}
    ${altbilgi(s, orgName)}
  `;

  hujjatniYoz(w, { nom: `Faktura №${o.order_number}`, uslub: uslub(s), tana });
}
