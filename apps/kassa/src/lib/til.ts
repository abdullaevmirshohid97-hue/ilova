// =============================================================
//  TIL — o'zbekcha va ruscha
//
//  O'zbekistonda savdo qiladigan odamlarning kattagina qismi
//  kundalik ishni rus tilida yuritadi. Ilova faqat o'zbekcha
//  bo'lsa, ular birinchi ekrandayoq boshqa ilovaga o'tadi.
//
//  KALIT — O'ZBEKCHA MATNNING O'ZI. Sabab:
//   · `t('Kirim')` — kodni o'qiganda nima yozilishi ko'rinib turadi,
//     `t('bosh.kirim')` da esa lug'atga qarash kerak;
//   · tarjima topilmasa o'zbekcha chiqadi — ekran hech qachon
//     bo'sh yoki "undefined" bo'lib qolmaydi;
//   · sinov (`tests/kassa-til.mjs`) kodni o'qib, har bir `t('…')`
//     uchun ruscha bor-yo'qligini tekshira oladi. Kalit o'ylab
//     topilganda bunday tekshiruv imkonsiz edi.
//
//  MODUL DARAJASIDAGI `joriy` ataylab: sana formatlagich (`davr.ts`)
//  va hisobot (`hisobot.ts`) komponent emas, ularda hook chaqirib
//  bo'lmaydi. Provayder tilni o'zgartirganda ikkalasi ham darhol
//  yangi tilga o'tadi.
// =============================================================

import { createContext, useContext } from 'react';

export type Til = 'uz' | 'ru';

const RU: Record<string, string> = {
  // ---------- Umumiy ----------
  'Kirim': 'Приход',
  'Chiqim': 'Расход',
  'Farq': 'Разница',
  'FARQ': 'РАЗНИЦА',
  'Saqlash': 'Сохранить',
  'Saqlandi': 'Сохранено',
  'Qo‘shish': 'Добавить',
  'Bekor qilish': 'Отменить',
  'O‘chirish': 'Удалить',
  'Yopish': 'Закрыть',
  'Davom etish': 'Продолжить',
  'Qayta urinish': 'Повторить',
  'Chiqish': 'Выйти',
  'Xatolik': 'Ошибка',
  'Yuklanmoqda': 'Загрузка',
  'Yuklanmoqda…': 'Загрузка…',
  'Hammasi': 'Всё',
  'Hammasi ›': 'Все ›',
  'Tushunarli': 'Понятно',
  'Ixtiyoriy': 'Необязательно',
  'Turi': 'Тип',
  'Nom': 'Название',
  'Ism': 'Имя',
  'Izoh': 'Примечание',
  'Sana': 'Дата',
  'Summa': 'Сумма',
  'Valyuta': 'Валюта',
  'Val.': 'Вал.',
  'Turkum': 'Категория',
  'Kontakt': 'Контакт',
  'Hisob': 'Счёт',
  'Rol': 'Роль',
  'Biznes': 'Бизнес',
  'Tashkilot': 'Организация',
  'Administrator': 'Администратор',

  // ---------- Bo'limlar ----------
  'Bosh': 'Главная',
  'Yozuvlar': 'Записи',
  'Kalendar': 'Календарь',
  'Hamkor': 'Партнёр',
  'Hujjat chiqmadi': 'Документ не создан',
  'Berildi': 'Отдано',
  'Olindi': 'Получено',
  'To‘langan': 'Оплачено',
  'Qoldi': 'Остаток',
  'Muddat': 'Срок',
  'Holat': 'Статус',
  'OLDI-BERDI': 'СДЕЛКА',
  'Harakat': 'Действие',
  'Nomi': 'Наименование',
  'Narx': 'Цена',
  'Yopilgan': 'Закрыто',
  'Bekor qilingan': 'Отменено',
  '{n} kun kechikdi': 'просрочено на {n} дн.',
  'Qarzlar — bugungi holat': 'Долги — на сегодня',
  'Tasdiqlangan': 'Подтверждено',
  'Hamkor Telegramda tan olgan': 'Партнёр подтвердил в Telegram',
  'Tasdiqlanmagan': 'Не подтверждено',
  'Daftarda bor, hamkor hali tasdiqlamagan': 'Записано, но партнёр ещё не подтвердил',
  'Kontaktlar': 'Контакты',
  'Yana': 'Ещё',

  // ---------- Kirish ----------
  'CLARY': 'CLARY',
  'Hisob-kitob daftari': 'Книга учёта',
  'Email': 'Эл. почта',
  'Parol': 'Пароль',
  'Ism-familiya': 'Имя и фамилия',
  'ism@pochta.com': 'imya@pochta.com',
  'kamida 6 ta belgi': 'минимум 6 символов',
  'Email manzilini to‘liq kiriting.': 'Введите адрес эл. почты полностью.',
  'Parol kamida 6 ta belgi bo‘lsin.': 'Пароль должен быть не короче 6 символов.',
  'Email yoki parol noto‘g‘ri.': 'Неверная почта или пароль.',
  'Bu email allaqachon ro‘yxatdan o‘tgan.': 'Эта почта уже зарегистрирована.',
  'Email hali tasdiqlanmagan — pochtangizni tekshiring.':
    'Почта ещё не подтверждена — проверьте письмо.',
  'Avval tizimga kiring.': 'Сначала войдите в систему.',
  'Yukchibolla platformasi · yukchibolla.com': 'Платформа Yukchibolla · yukchibolla.com',

  // ---------- Biznes ----------
  'Biznesingiz nomi': 'Название вашего бизнеса',
  'Masalan: Anvar do‘koni': 'Например: Магазин Анвара',
  'Boshlash': 'Начать',
  'Biznes nomi kamida 2 ta belgi bo‘lsin.': 'Название бизнеса — минимум 2 символа.',
  'Bu hisobda allaqachon biznes ochilgan.': 'На этом аккаунте бизнес уже создан.',
  'Boshqa hisob bilan kirish': 'Войти под другим аккаунтом',

  // ---------- Bosh ekran ----------
  'Umumiy balans': 'Общий баланс',
  'Shu oy': 'Этот месяц',
  'Shu hafta': 'Эта неделя',
  'Oxirgi 7 kun': 'Последние 7 дней',
  'Qarzlar': 'Долги',
  'Bizga qarzdor': 'Нам должны',
  'Biz qarzdormiz': 'Мы должны',
  'Hisoblar': 'Счета',
  'Oxirgi yozuvlar': 'Последние записи',
  'Hali yozuv yo‘q': 'Пока нет записей',
  'Pastdagi + tugmasi bilan birinchi yozuvni kiriting':
    'Добавьте первую запись кнопкой + внизу',
  '↑ Kirim': '↑ Приход',
  '↓ Chiqim': '↓ Расход',
  'Takrorlash': 'Повторить',
  'BEKOR QILINGAN': 'ОТМЕНЕНО',
  'o‘tkazma': 'перевод',

  // ---------- Yozuv oynasi ----------
  'Hisoblararo o‘tkazma': 'Перевод между счетами',
  'Yozuvni tahrirlash': 'Изменить запись',
  'Qaysi hisobdan': 'С какого счёта',
  'Qaysi hisobga': 'На какой счёт',
  'Kim bilan (ixtiyoriy)': 'С кем (необязательно)',
  'Nima uchun': 'За что',
  'Bugun': 'Сегодня',
  'Kecha': 'Вчера',
  'Ertaga': 'Завтра',
  'Hisobni tanlang.': 'Выберите счёт.',
  'Summani kiriting.': 'Введите сумму.',
  'Ikki xil hisob tanlang.': 'Выберите два разных счёта.',
  'Qaysi hisobga o‘tkazilishini tanlang.': 'Выберите счёт назначения.',
  'Valyutalari har xil hisoblar orasida o‘tkazma hozircha yo‘q.':
    'Перевод между счетами в разных валютах пока не поддерживается.',
  'Turkum yo‘q — «Yana» bo‘limidan qo‘shasiz':
    'Категорий нет — добавьте их в разделе «Ещё»',

  // ---------- Yozuvlar ro'yxati ----------
  'Izoh, turkum, kontakt yoki summa': 'Примечание, категория, контакт или сумма',
  'Hamma hisob': 'Все счета',
  'Kunlik': 'День',
  'Haftalik': 'Неделя',
  'Oylik': 'Месяц',
  'Topilmadi': 'Не найдено',
  'Bu davrda yozuv yo‘q': 'За этот период записей нет',
  'Boshqa so‘z bilan qidirib ko‘ring': 'Попробуйте другое слово',
  'Davrni almashtiring yoki yangi yozuv qo‘shing':
    'Смените период или добавьте запись',
  'Tahrirlash uchun teging · bekor qilish uchun bosib turing':
    'Коснитесь, чтобы изменить · удерживайте, чтобы отменить',
  'Yozuvni bekor qilish': 'Отменить запись',
  'Qoldiq': 'Остаток',

  // ---------- Kalendar ----------
  'Kunlar bo‘yicha kirim va chiqim': 'Приход и расход по дням',
  'Oylik kirim': 'Приход за месяц',
  'Oylik chiqim': 'Расход за месяц',
  'Bu kuni yozuv yo‘q': 'В этот день записей нет',

  // ---------- Kontaktlar ----------
  'Yangi kontakt': 'Новый контакт',
  '+ Kontakt qo‘shish': '+ Добавить контакт',
  'Masalan: Ahmad': 'Например: Ахмад',
  'Ism yoki telefon': 'Имя или телефон',
  'Telefon (ixtiyoriy)': 'Телефон (необязательно)',
  'Ismni kiriting.': 'Введите имя.',
  'Mijoz': 'Клиент',
  'Ta’minotchi': 'Поставщик',
  'Qarzi bor': 'Есть долг',
  'Oldindan': 'Предоплата',
  'Yozuv yo‘q': 'Нет записей',
  'Bu filtrda hech kim yo‘q': 'По этому фильтру никого нет',
  'Mijoz yoki ta’minotchi qo‘shsangiz, kim qancha qarz — shu yerda ko‘rinadi':
    'Добавьте клиента или поставщика — и здесь будет видно, кто сколько должен',
  'mijoz va ta’minotchi': 'клиенты и поставщики',
  'Pastdagi tugmalar bilan birinchi amalni kiriting':
    'Добавьте первую операцию кнопками внизу',
  'Tovar berdim': 'Отдал товар',
  'Pul oldim': 'Получил деньги',
  'Kontaktni yashirish': 'Скрыть контакт',

  // ---------- Yana ----------
  'Boshqaruv': 'Управление',
  'Tahlil': 'Анализ',
  'Sozlamalar': 'Настройки',
  'Kirim va chiqim turkumlari': 'Категории прихода и расхода',
  'Bir hisobdan ikkinchisiga': 'С одного счёта на другой',
  'Hisobot': 'Отчёт',
  'Davr, turkum va hisob kesimida': 'По периоду, категории и счёту',
  'AI': 'ИИ',
  'AI modeli': 'Модель ИИ',
  'AI ulanish': 'Подключение ИИ',
  'O‘z obunangizni ulang: Claude, ChatGPT yoki Gemini':
    'Подключите свою подписку: Claude, ChatGPT или Gemini',
  'Sun’iy intellekt agentini daftaringizga ulash':
    'Подключение ИИ-агента к вашей книге',
  'Biznes nomi, ko‘rinish, chiqish': 'Название бизнеса, оформление, выход',
  'Clary · Yukchibolla platformasi': 'Clary · Платформа Yukchibolla',
  'Turkumlar': 'Категории',
  'TURKUMLAR': 'КАТЕГОРИИ',

  // ---------- Hisoblar ----------
  '+ Hisob qo‘shish': '+ Добавить счёт',
  'Yangi hisob': 'Новый счёт',
  'Hisob yo‘q': 'Нет счетов',
  'Nomni kiriting.': 'Введите название.',
  'Naqd, Karta, Bank...': 'Наличные, Карта, Банк...',
  'Boshlang‘ich qoldiq': 'Начальный остаток',
  'Hisobni yashirish': 'Скрыть счёт',
  'yashirilgan': 'скрыт',
  'naqd': 'наличные',
  'bank': 'банк',
  'karta': 'карта',
  'boshqa': 'другое',

  // ---------- Turkumlar ----------
  'Kirim turkumlari': 'Категории прихода',
  'Chiqim turkumlari': 'Категории расхода',
  'Turkum yo‘q': 'Категорий нет',
  'Pastdan qo‘shing': 'Добавьте снизу',
  'Turkumni yashirish': 'Скрыть категорию',
  'Yangi turkum nomi': 'Название новой категории',

  // ---------- Hisobot ----------
  'Excel': 'Excel',
  'PDF': 'PDF',
  'Bo‘sh hisobot': 'Пустой отчёт',
  'Bu davrda yozuv yo‘q — avval davrni almashtiring.':
    'За этот период записей нет — смените период.',
  'Chiqarib bo‘lmadi': 'Не удалось выгрузить',
  'Kirim yo‘q': 'Прихода нет',
  'Chiqim yo‘q': 'Расхода нет',
  'HISOBOT —': 'ОТЧЁТ —',
  'Hujjat sanasi:': 'Дата документа:',
  'Turkumsiz': 'Без категории',
  'O‘tkazma': 'Перевод',
  '(kirim)': '(приход)',
  '(bekor qilingan)': '(отменено)',

  // ---------- Sozlamalar ----------
  'Biznes nomi': 'Название бизнеса',
  'Nomni saqlash': 'Сохранить название',
  'Ko‘rinish': 'Оформление',
  'Til': 'Язык',
  'Yorug‘': 'Светлое',
  'Tungi': 'Тёмное',
  // «Как в системе» uch chipli qatorga sig'masdi — qisqartirildi
  'Tizim': 'Системная',
  'O‘zbekcha': 'Узбекский',
  'Ruscha': 'Русский',
  'Xavfli zona': 'Опасная зона',
  'Hisobni o‘chirish': 'Удалить аккаунт',
  'O‘chirilmadi': 'Не удалено',
  'Tashkilot, hisoblar, yozuvlar va kontaktlar — hammasi':
    'Организация, счета, записи и контакты — всё',

  // ---------- AI ----------
  'Provayder': 'Провайдер',
  'Model': 'Модель',
  'Kalitni o‘chirish': 'Удалить ключ',
  'Boshqa kalit qo‘yish': 'Ввести другой ключ',
  'Ulanishni sinash': 'Проверить подключение',
  'Kalitni to‘liq ko‘chirib qo‘ying.': 'Вставьте ключ целиком.',
  'Saqlandi. Endi «Ulanishni sinash» bilan tekshiring.':
    'Сохранено. Теперь проверьте кнопкой «Проверить подключение».',
  '✓ Ulanish tekshirilgan va ishlayapti': '✓ Подключение проверено и работает',
  'AI ulanishi o‘chadi. Ilova o‘zi ishlayveradi.':
    'Подключение ИИ будет отключено. Приложение продолжит работать.',
  'Yangi ulanish': 'Новое подключение',
  'Ulanish yaratish': 'Создать подключение',
  'Mavjud ulanishlar': 'Существующие подключения',
  'Ulanish yo‘q': 'Подключений нет',
  'Yuqoridan yangi ulanish yarating': 'Создайте подключение выше',
  'Nomi (masalan: Telefondagi yordamchi)': 'Название (например: помощник в телефоне)',
  'Yozuv qo‘sha olsin': 'Разрешить добавлять записи',
  'faqat o‘qish': 'только чтение',
  'Server manzili': 'Адрес сервера',
  'Ulanishni yopish': 'Закрыть подключение',
  '✓ Ko‘chirildi': '✓ Скопировано',
  'ishlatilmagan': 'не использован',

  'Internet bilan aloqa yo‘q. Ulanishni tekshiring.': 
    'Нет связи с интернетом. Проверьте подключение.',
  'Parol kamida 6 ta belgi bo‘lishi kerak.': 'Пароль должен быть не короче 6 символов.',
  'Noma’lum xatolik': 'Неизвестная ошибка',
  'Ombor hali tayyor emas': 'Хранилище ещё не готово',
  'Ombor ochilmagan': 'Хранилище не открыто',
  'Yozuv topilmadi': 'Запись не найдена',
  'Bir xil hisob tanlangan': 'Выбран один и тот же счёт',
  'Javob kelmadi': 'Ответ не получен',
  'Server qabul qilmadi': 'Сервер не принял запись',
  'IndexedDB yo‘q': 'IndexedDB недоступен',

  'Yo‘q': 'Нет',
  'Yashirish': 'Скрыть',
  'Qaytarish': 'Вернуть',
  'Kirish': 'Войти',
  'jami': 'всего',
  '{n} ta': '{n} шт.',
  'Ro‘yxatdan o‘tish': 'Регистрация',
  'Hisobingiz bormi? Kirish': 'Уже есть аккаунт? Войти',
  'Hisob yo‘qmi? Ro‘yxatdan o‘tish': 'Нет аккаунта? Зарегистрироваться',
  'Ro‘yxatdan o‘tdingiz. Pochtangizga tasdiqlash xati yuborildi — havolani bosing va shu yerga qaytib kiring.': 
    'Вы зарегистрированы. На почту отправлено письмо — перейдите по ссылке и вернитесь сюда.',
  'Kontakt yo‘q': 'Контактов нет',
  'hisob yopiq': 'расчёт закрыт',
  'qarzi': 'долг',
  'oldindan': 'предоплата',
  'Oldindan to‘lagan': 'Оплачено вперёд',
  'Hisob yopiq': 'Расчёт закрыт',
  'ro‘yxatdan olib tashlanadi. Yozuvlari va tarixi joyida qoladi.': 
    'будет убран из списка. Записи и история останутся на месте.',
  'Hisobni qaytarish': 'Вернуть счёт',
  'Hisobni tahrirlash': 'Изменить счёт',
  '(hozir hisobda qancha bor)': '(сколько сейчас на счёте)',
  'Hisob ro‘yxatdan olib tashlanadi. Yozuvlari va qoldig‘i saqlanadi — istalgan vaqt qaytarasiz.': 
    'Счёт будет убран из списка. Записи и остаток сохранятся — вернуть можно в любой момент.',
  'Hisob yana ro‘yxatda ko‘rinadi.': 'Счёт снова появится в списке.',
  '{n} ta yozuv': 'записей: {n}',
  'Yangi kirim turkumi': 'Новая категория прихода',
  'Yangi chiqim turkumi': 'Новая категория расхода',
  'yangi yozuvlarda ko‘rinmaydi. Eski yozuvlar o‘zgarmaydi.': 
    'не будет появляться в новых записях. Старые записи не изменятся.',
  'hisobdan chiqadi, lekin tarixda qoladi.': 'уйдёт из расчёта, но останется в истории.',
  'va undagi hamma narsa o‘chadi:': 'и всё, что в нём, будет удалено:',
  '· hisoblar va ularning qoldig‘i': '· счета и их остатки',
  '· hamma kirim va chiqim yozuvlari': '· все записи прихода и расхода',
  '· kontaktlar va qarz tarixi': '· контакты и история долгов',
  '· kirish hisobingiz': '· ваш аккаунт для входа',
  'Qaytarib bo‘lmaydi. Avval hisobotni Excel’ga chiqarib olishni maslahat beramiz.': 
    'Отменить будет нельзя. Советуем сначала выгрузить отчёт в Excel.',
  'Oxirgi tasdiq': 'Последнее подтверждение',
  'Ma’lumot butunlay yo‘q qilinadi. Davom etasizmi?': 
    'Данные будут уничтожены полностью. Продолжить?',
  'Ha, o‘chirilsin': 'Да, удалить',
  'O‘chirildi': 'Удалено',
  '{n} ta yozuv o‘chirildi.': 'удалено записей: {n}.',
  'Hisobdan chiqasizmi?': 'Выйти из аккаунта?',
  'Kalit ulash': 'Подключить ключ',
  'Kalit ishlamayapti': 'Ключ не работает',
  'Saqlangan — hali sinalmagan': 'Сохранён — ещё не проверен',
  'Ulanish ishlayapti. Model javobi:': 'Подключение работает. Ответ модели:',
  'endi ishlamaydi. Davom etamizmi?': 'перестанет работать. Продолжить?',
  'Kalitni ko‘chirish': 'Скопировать ключ',
  'Manzilni ko‘chirish': 'Скопировать адрес',
  'o‘qish + yozish': 'чтение + запись',
  '{n} so‘rov': 'запросов: {n}',
  'yopish': 'закрыть',
  'yopilgan': 'закрыто',
  '{n} ta o‘zgarish qo‘llanmadi — ko‘rish': 'не применено изменений: {n} — посмотреть',
  'Internet yo‘q · {n} ta yozuv navbatda': 'Нет интернета · в очереди записей: {n}',
  'Internet yo‘q — yozuvlar qurilmada saqlanyapti': 
    'Нет интернета — записи сохраняются на устройстве',
  '{n} ta yozuv yuborilmoqda…': 'отправляется записей: {n}…',

  // ---------- Kun yakuni ----------
  'Kun yakuni': 'Итог дня',
  'Kunni yakunlang': 'Подведите итог дня',
  'Kunni yopish': 'Закрыть день',
  'Farqni yozib, yopish': 'Записать разницу и закрыть',
  'Kassani sanang — farq bo‘lsa bugun topiladi': 'Пересчитайте кассу — разницу найдём сегодня',
  '✓ Bugungi kassa sanab bo‘lindi': '✓ Касса за сегодня пересчитана',
  'Kassada haqiqatda qancha bor?': 'Сколько на самом деле в кассе?',
  'Pulni sanang va shu yerga yozing': 'Пересчитайте деньги и впишите сюда',
  'Daftar bo‘yicha': 'По книге',
  'Sanalgan': 'Пересчитано',
  'Kassa sanog‘i': 'Пересчёт кассы',
  'Hammasi to‘g‘ri keldi.': 'Всё сошлось.',
  'Kassada daftardagidan ko‘p. Ehtimol bir kirim yozilmagan — farq «Kassa sanog‘i» yozuvi bo‘lib tushadi.': 
    'В кассе больше, чем по книге. Возможно, не записан приход — разница ляжет записью «Пересчёт кассы».',
  'Kassada daftardagidan kam. Ehtimol bir chiqim yozilmagan — farq «Kassa sanog‘i» yozuvi bo‘lib tushadi.': 
    'В кассе меньше, чем по книге. Возможно, не записан расход — разница ляжет записью «Пересчёт кассы».',

  // ---------- Oldi-berdi ----------
  'Nima qildingiz?': 'Что вы сделали?',
  'Tovar oldim': 'Взял товар',
  'Qarz oldim': 'Взял в долг',
  'Qarz berdim': 'Дал в долг',
  'Pul berdim': 'Отдал деньги',
  'Kassa kirimi': 'Приход в кассу',
  'Kassa chiqimi': 'Расход из кассы',
  'Kim bilan': 'С кем',
  'Almashtirish': 'Изменить',
  'Hamkorni tanlang.': 'Выберите партнёра.',
  'Avval «Hamkorlar» bo‘limidan hamkor qo‘shing': 'Сначала добавьте партнёра в разделе «Партнёры»',
  'Tovar': 'Товар',
  'Tovar nomini yozing.': 'Укажите название товара.',
  'Masalan: Karobka': 'Например: Коробка',
  'Miqdor': 'Количество',
  'Narxi': 'Цена',
  'Jami': 'Итого',
  'Miqdor × narx bo‘yicha hisoblash': 'Посчитать по количеству × цене',
  'Shundan keyin': 'После этого',
  'sizga qarzdor bo‘ladi': 'будет должен вам',
  'Siz qarzdor bo‘lasiz': 'Вы будете должны',
  'Kassaga tegmaydi — bu faqat qarz': 'Кассы не касается — это только долг',
  'dona': 'шт.',
  'kg': 'кг',
  'metr': 'м',
  'quti': 'коробка',
  'litr': 'л',
  'Sizga qarzdor': 'Должен вам',
  'Siz qarzdorsiz': 'Вы должны',
  'Qaysi bitimga (ixtiyoriy)': 'К какой сделке (необязательно)',
  'Umumiy qarzga': 'В общий долг',
  'Qarz': 'Долг',
  'To‘lov': 'Оплата',
  'Usuli': 'Способ',
  'Naqd': 'Наличные',
  'Karta': 'Карта',
  'Bank': 'Банк',
  'Hozir': 'Сейчас',
  'To‘lovdan keyin': 'После оплаты',
  '✓ Oldi-berdi yakunlanadi': '✓ Расчёт будет завершён',
  'To‘lov yo‘nalishi bitimga teskari bo‘lishi kerak.': 
    'Направление оплаты должно быть обратным сделке.',
  'Bu bitim boshqa hamkorniki.': 'Эта сделка принадлежит другому партнёру.',
  'Hamkorlar': 'Партнёры',
  'Operatsiyalar': 'Операции',
  'Menga qarzdor': 'Должны мне',
  'Men qarzdorman': 'Я должен',
  'Bitim yo‘q': 'Сделок нет',
  'Muddati o‘tgan': 'Просрочено',
  'kutilmoqda': 'ожидает',
  'tasdiqlangan': 'подтверждено',
  'rad': 'отклонено',
  'bekor': 'отменено',
  'qoldi': 'осталось',
  '+ Operatsiya': '+ Операция',
  '+ To‘lov': '+ Оплата',
  'Bitimni bekor qilish': 'Отменить сделку',

  // ---------- Sinx va xatolar ----------
  'Sinxronlanmoqda…': 'Синхронизация…',
  'Ro‘yxat bo‘sh': 'Список пуст',
  'Bu qurilmada saqlash ishlamayapti — ilova internetsiz ochilmaydi':
    'На этом устройстве не работает хранилище — без интернета приложение не откроется',
  'Bu yozuv boshqa qurilmada o‘zgargan — sizning o‘zgarishingiz qo‘llanmadi':
    'Эта запись изменена на другом устройстве — ваше изменение не применено',
  'Bu qurilmada fayl ulashish yo‘q': 'На этом устройстве нет функции «Поделиться»',
  'Ilovada nosozlik': 'Сбой в приложении',
  'Yozuvlaringiz joyida — ular telefonda saqlangan va yo‘qolmaydi. Nosozlik haqida bizga xabar ketdi.':
    'Ваши записи на месте — они сохранены в телефоне и не потеряются. Сообщение о сбое отправлено нам.',
  'TEXNIK MA’LUMOT': 'ТЕХНИЧЕСКИЕ ДАННЫЕ',
};

// Oy va hafta nomlari — `Intl` ishlatilmaydi (Telegram WebView'da
// RangeError bergan), shuning uchun qo'lda.
export const OY_NOMLARI: Record<Til, string[]> = {
  uz: [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
  ],
  ru: [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ],
};

/**
 * Sana ichidagi oy nomi: «15 сентября».
 *
 * Rus tilida sana bilan oy QARATQICH kelishigida keladi:
 * oyning o‘zi «сентябрь», lekin sana bilan «15 сентября».
 * O‘zbekchada farq yo‘q, shuning uchun ro‘yxat bir xil.
 */
export const OY_SANADA: Record<Til, string[]> = {
  uz: OY_NOMLARI.uz,
  ru: [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ],
};

export const HAFTA_NOMLARI: Record<Til, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

let joriy: Til = 'uz';

/** Komponentdan tashqarida (davr.ts, hisobot.ts) kerak bo'ladi */
export function joriyTil(): Til {
  return joriy;
}

export function joriyTilniQoy(t: Til): void {
  joriy = t;
}

/** Tarjima. Topilmasa o'zbekchasi qaytadi — ekran hech qachon bo'sh qolmaydi. */
export function tr(matn: string): string {
  if (joriy === 'uz') return matn;
  return RU[matn] ?? matn;
}

export const TilKontekst = createContext<{ til: Til; qoy: (t: Til) => void }>({
  til: 'uz',
  qoy: () => {},
});

export function useTil() {
  const { til, qoy } = useContext(TilKontekst);
  // `t` modul funksiyasi: `til` o'zgarganda komponent qayta
  // chiziladi va o'shanda `joriy` allaqachon yangilangan bo'ladi.
  return { tr, til, qoy };
}

/**
 * Ichida son bo‘lgan matn: trn(‘{n} ta yozuv’, 5).
 *
 * Sonni matnga YOPISHTIRMAYMIZ: rus tilida so'z tartibi boshqa
 * va «5 ta yozuv» → «5 записей» bo‘ladi. Shuning uchun o‘rni
 * lug‘atda {n} bilan belgilanadi.
 */
export function trn(matn: string, n: number | string): string {
  return tr(matn).split('{n}').join(String(n));
}

/** Sinov uchun: lug'atda nima borligini tekshirish */
export function ruLugat(): Record<string, string> {
  return RU;
}
