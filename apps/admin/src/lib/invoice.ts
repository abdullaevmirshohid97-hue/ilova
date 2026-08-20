import { formatDate, formatSum, formatUsd } from './supabase';

// Faktura bitta joyda yasaladi — admin ham, menejer ham AYNAN shu
// ko'rinishni ochadi. Farqi faqat narxda: admin sahifasi baza (rasmiy)
// narxni uzatadi, menejer esa o'z narxini — chunki qaysi narx ko'rinishini
// chaqiruvchi sahifa hal qiladi, bu fayl emas.
//
// Valyuta ham shunday: menejer mijozni dollarda savdo qilsa, sahifa
// currency='USD' va dollardagi narxlarni (order_items.orig_price) uzatadi.
// Baza narx doim so'mda, shuning uchun admin sahifasi valyuta bermaydi.

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

const esc = (s: string) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

// Faktura HAR QANDAY holatdagi buyurtma uchun ochiladi (yopilgani ham,
// hali tasdiqlanmagani ham). Tasdiqlanmaganida yuqorida ogohlantirish
// chiqadi, chunki narx/miqdor hali o'zgarishi mumkin.
export function openInvoice(o: InvoiceOrder, orgName: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert("Faktura oynasi ochilmadi — brauzer pop-up'ni bloklagan bo'lishi mumkin.");
    return;
  }
  const tasdiqlanmagan = o.status === 'new' || o.status === 'cancelled';
  const usd = o.currency === 'USD';
  const pul = (n: number) => (usd ? formatUsd(n) : formatSum(n));

  w.document.write(`
      <html><head><meta charset="utf-8"><title>Faktura №${o.order_number}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #14151a; margin: 0; }
        .head { display: flex; justify-content: space-between; align-items: flex-start;
                border-bottom: 3px solid #7000FF; padding-bottom: 12px; }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 1px; color: #7000FF; }
        .sub { color: #666; font-size: 12px; margin-top: 2px; }
        .no { text-align: right; }
        .no b { font-size: 26px; }
        .warn { margin-top: 12px; padding: 8px 12px; background: #fff4e5;
                border-left: 4px solid #ff9800; font-size: 12px; font-weight: 700; color: #8a5200; }
        .grid { display: flex; gap: 40px; margin-top: 18px; font-size: 13px; }
        .grid div span { color: #777; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
        th { background: #f4f0ff; text-align: left; padding: 9px 10px; border: 1px solid #ddd;
             font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
        td { border: 1px solid #ddd; padding: 8px 10px; vertical-align: middle; }
        td.num, th.num { text-align: right; white-space: nowrap; }
        tfoot td { font-weight: 800; background: #faf7ff; font-size: 15px; }
        .foot { margin-top: 30px; display: flex; justify-content: space-between;
                font-size: 12px; color: #666; }
        .sign { margin-top: 40px; font-size: 12px; }
        .sign span { display: inline-block; width: 200px; border-bottom: 1px solid #999; }
        @media print { .noprint { display: none; } }
        .noprint { position: fixed; top: 10px; right: 10px; }
        .noprint button { background: #7000FF; color: #fff; border: 0; padding: 10px 18px;
                          border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
      </style></head><body>

      <div class="noprint"><button onclick="window.print()">🖨 Chop etish / PDF saqlash</button></div>

      <div class="head">
        <div>
          <div class="brand">${esc(orgName || 'YUKCHIBOLLA')}</div>
          <div class="sub">Ulgurji savdo · faktura</div>
        </div>
        <div class="no">
          <div style="font-size:11px;color:#777;text-transform:uppercase">Faktura</div>
          <b>№${o.order_number}</b>
          <div class="sub">${formatDate(o.created_at)}</div>
        </div>
      </div>

      ${tasdiqlanmagan ? `<div class="warn">⚠ ${STATUS_LABEL[o.status] ?? o.status} — bu faktura yakuniy emas, miqdor va summa hali o'zgarishi mumkin.</div>` : ''}

      <div class="grid">
        <div><span>Mijoz</span><br><b>${esc(o.customer)}</b></div>
        <div><span>Telefon</span><br><b>${esc(o.phone ?? '—')}</b></div>
        <div><span>Holat</span><br><b>${STATUS_LABEL[o.status] ?? o.status}</b></div>
      </div>

      <table>
        <thead><tr>
          <th style="width:30px">№</th><th style="width:56px">Rasm</th><th>Mahsulot</th><th>Razmer / Rang</th>
          <th class="num">Miqdor</th><th class="num">Narx</th><th class="num">Summa</th>
        </tr></thead>
        <tbody>
        ${o.items
          .map(
            (it, i) =>
              `<tr>
                 <td>${i + 1}</td>
                 <td>${
                   it.image
                     ? `<img src="${it.image}" style="width:44px;height:44px;object-fit:cover;border-radius:5px;display:block" />`
                     : '<div style="width:44px;height:44px;border-radius:5px;background:#f0f0f4"></div>'
                 }</td>
                 <td><b>${esc(it.name)}</b><div style="color:#888;font-size:11px">${esc(it.sku)}</div></td>
                 <td>${esc([it.size, it.color].filter(Boolean).join(' / ') || '—')}</td>
                 <td class="num">${it.qty.toLocaleString('ru-RU')}</td>
                 <td class="num">${pul(it.unit_price)}</td>
                 <td class="num">${pul(it.unit_price * it.qty)}</td>
               </tr>`
          )
          .join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="6" class="num">JAMI</td><td class="num">${pul(o.total)}</td>
        </tr></tfoot>
      </table>

      ${
        usd && o.totalUzs != null
          ? `<div style="margin-top:8px;text-align:right;font-size:12px;color:#777">
               Kurs bo'yicha: <b>${formatSum(o.totalUzs)}</b>
             </div>`
          : ''
      }

      <div class="sign">
        Topshirdi: <span></span> &nbsp;&nbsp;&nbsp; Qabul qildi: <span></span>
      </div>

      <div class="foot">
        <div>${esc(orgName || 'Yukchibolla')}</div>
        <div>Chop etilgan: ${new Date().toLocaleString('ru-RU')}</div>
      </div>
      </body></html>
    `);
  w.document.close();
}
