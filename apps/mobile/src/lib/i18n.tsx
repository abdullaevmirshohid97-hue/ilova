import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ilova/lang';

export type Lang = 'uz' | 'ru';

// O'zbekcha lug'at — barcha kalitlarning manba nusxasi
const uz = {
  cancel: 'Bekor qilish',
  save: 'Saqlash',
  error: 'Xatolik',

  menuCatalog: 'Katalog',
  menuCart: 'Savat',
  menuOrders: 'Buyurtmalarim',
  menuLedger: 'Hisob-kitob',
  menuProfile: 'Profil',
  debtLabel: 'Qarz: {amount}',
  creditLabel: 'Haqingiz: {amount}',
  accountClean: 'Hisob toza ✅',
  logout: 'Chiqish',
  language: 'Til',

  loginSubtitle: 'Ulgurji savdo tizimi',
  loginPhoneLabel: 'Telefon raqam',
  loginPasswordLabel: 'Parol',
  loginPasswordPlaceholder: 'Parolingiz',
  loginError: "Telefon yoki parol noto'g'ri",
  loginButton: 'Kirish',
  loginHint: "Akkaunt olish uchun do`kon administratoriga murojaat qiling",
  forgotLink: 'Parolni unutdingizmi?',
  forgotTitle: 'Parolni unutdingizmi?',
  forgotBody:
    "Parolni tiklash uchun do'kon administratoriga murojaat qiling va telefon raqamingizni ayting. Admin sizga yangi parol beradi.",
  forgotClose: 'Tushunarli',

  searchPlaceholder: "Nomi yoki model bo'yicha qidirish...",
  categoryAll: 'Hammasi',
  emptyCatalog: 'Hech narsa topilmadi',
  offlineBanner: "📡 Oflayn rejim — oxirgi ma'lumotlar ko'rsatilmoqda",
  stockAvailable: '{n} dona mavjud',
  stockOut: 'Tugagan',
  variantsSectionTitle: 'Variantni tanlang',
  qtyPlaceholder: 'Necha dona?',
  addToCartWithSum: 'Savatga · {sum}',
  addToCart: 'Savatga qo`shish',

  cartEmptyTitle: "Savat bo'sh",
  cartEmptyHint: 'Katalogdan tovar tanlang',
  removeItem: "O'chirish",
  commentPlaceholder: 'Buyurtmaga izoh (ixtiyoriy)',
  totalLabel: 'Jami:',
  placeOrder: 'Buyurtma berish',
  reserveHint: 'Buyurtma berilganda tovar siz uchun darhol band qilinadi',
  stockErrorMsg:
    "Kechirasiz, ba'zi tovarlar qoldig'i yetarli emas. Katalogni yangilab, qaytadan urinib ko'ring.",
  orderFailedMsg: "Buyurtma yuborilmadi. Internetni tekshirib, qaytadan urinib ko'ring.",
  orderSuccessTitle: 'Buyurtma qabul qilindi! ✅',
  orderSuccessBody:
    'Tovar siz uchun band qilindi. Admin tasdiqlagach, holati «Buyurtmalarim»da yangilanadi.',
  goToOrders: 'Buyurtmalarim',

  cancelOrderTitle: 'Buyurtmani bekor qilish',
  cancelOrderBody: '№{num} buyurtmani bekor qilasizmi?',
  cancelOrderNo: "Yo'q",
  cancelOrderYes: 'Ha, bekor qil',
  cancelOrderFailed: "Bekor qilib bo'lmadi — admin allaqachon qabul qilgan bo'lishi mumkin.",
  ordersEmptyTitle: "Hali buyurtma yo'q",
  ordersEmptyHint: 'Katalogdan tanlab, savat orqali buyurtma bering',

  ledgerDebtLabel: 'Sizning qarzingiz',
  ledgerCreditLabel: 'Sizning haqingiz',
  ledgerNeutralLabel: 'Hisob-kitob',
  ledgerDebtHint: "To'lov qilganingizda bu summa kamayadi",
  ledgerCreditHint: "Do'kon sizga qarzdor — keyingi buyurtmada hisobga olinadi",
  ledgerNeutralHint: 'Qarzdorlik yo`q — hisob toza ✅',
  ledgerHistoryTitle: 'Oldi-berdi tarixi',
  ledgerEmpty: "Hozircha yozuvlar yo'q",

  profileOrdersLabel: 'Buyurtmalar',
  profileTariffLabel: 'Narx tarifi',
  profileDebtLabel: 'Qarzdorlik',
  profileBalanceLabel: 'Balans',
  profileDebtHint: "To'lov qilganingizda admin kiritadi va bu yerda kamayadi",
  profileNoDebtHint: 'Sizda qarzdorlik yo`q',
  changePasswordLink: "🔑 Parolni o'zgartirish",
  changePasswordTitle: "Parolni o'zgartirish",
  oldPasswordPlaceholder: 'Eski parol',
  newPasswordPlaceholder: 'Yangi parol',
  confirmPasswordPlaceholder: 'Yangi parol (tasdiqlash)',
  passwordTooShort: "Yangi parol kamida 6 belgi bo'lsin",
  passwordMismatch: 'Yangi parollar mos kelmadi',
  oldPasswordWrong: "Eski parol noto'g'ri",
  passwordChanged: "✅ Parol o'zgartirildi",

  statusNew: 'Kutilmoqda',
  statusConfirmed: 'Qabul qilindi',
  statusPicking: "Yig'ilmoqda",
  statusDone: 'Yopilgan',
  statusCancelled: 'Bekor qilingan',

  kindOrderDebt: 'Buyurtma',
  kindPayment: "To'lov",
  kindDiscount: 'Chegirma',
  kindAdjustment: 'Tuzatish',
  kindCancelReversal: 'Bekor qilindi',
};

// Ruscha lug'at — TypeScript uz'dagi har bir kalit tarjima qilinganini tekshiradi
const ru: Record<keyof typeof uz, string> = {
  cancel: 'Отмена',
  save: 'Сохранить',
  error: 'Ошибка',

  menuCatalog: 'Каталог',
  menuCart: 'Корзина',
  menuOrders: 'Мои заказы',
  menuLedger: 'Расчёты',
  menuProfile: 'Профиль',
  debtLabel: 'Долг: {amount}',
  creditLabel: 'Ваш баланс: {amount}',
  accountClean: 'Счёт чист ✅',
  logout: 'Выйти',
  language: 'Язык',

  loginSubtitle: 'Система оптовой торговли',
  loginPhoneLabel: 'Номер телефона',
  loginPasswordLabel: 'Пароль',
  loginPasswordPlaceholder: 'Ваш пароль',
  loginError: 'Неверный телефон или пароль',
  loginButton: 'Войти',
  loginHint: 'Для получения аккаунта обратитесь к администратору магазина',
  forgotLink: 'Забыли пароль?',
  forgotTitle: 'Забыли пароль?',
  forgotBody:
    'Для восстановления пароля обратитесь к администратору магазина и назовите свой номер телефона. Администратор выдаст вам новый пароль.',
  forgotClose: 'Понятно',

  searchPlaceholder: 'Поиск по названию или модели...',
  categoryAll: 'Все',
  emptyCatalog: 'Ничего не найдено',
  offlineBanner: '📡 Офлайн-режим — показаны последние данные',
  stockAvailable: '{n} шт. в наличии',
  stockOut: 'Нет в наличии',
  variantsSectionTitle: 'Выберите вариант',
  qtyPlaceholder: 'Сколько штук?',
  addToCartWithSum: 'В корзину · {sum}',
  addToCart: 'В корзину',

  cartEmptyTitle: 'Корзина пуста',
  cartEmptyHint: 'Выберите товар в каталоге',
  removeItem: 'Удалить',
  commentPlaceholder: 'Комментарий к заказу (необязательно)',
  totalLabel: 'Итого:',
  placeOrder: 'Оформить заказ',
  reserveHint: 'При оформлении заказа товар сразу резервируется для вас',
  stockErrorMsg:
    'Извините, некоторых товаров недостаточно на складе. Обновите каталог и попробуйте снова.',
  orderFailedMsg: 'Заказ не отправлен. Проверьте интернет и попробуйте снова.',
  orderSuccessTitle: 'Заказ принят! ✅',
  orderSuccessBody:
    'Товар для вас зарезервирован. После подтверждения администратором статус обновится в «Мои заказы».',
  goToOrders: 'Мои заказы',

  cancelOrderTitle: 'Отмена заказа',
  cancelOrderBody: 'Отменить заказ №{num}?',
  cancelOrderNo: 'Нет',
  cancelOrderYes: 'Да, отменить',
  cancelOrderFailed: 'Не удалось отменить — возможно, администратор уже принял заказ.',
  ordersEmptyTitle: 'Заказов пока нет',
  ordersEmptyHint: 'Выберите товар в каталоге и оформите заказ через корзину',

  ledgerDebtLabel: 'Ваш долг',
  ledgerCreditLabel: 'Ваш баланс',
  ledgerNeutralLabel: 'Расчёты',
  ledgerDebtHint: 'Эта сумма уменьшится после оплаты',
  ledgerCreditHint: 'Магазин должен вам — будет учтено в следующем заказе',
  ledgerNeutralHint: 'Задолженности нет — счёт чист ✅',
  ledgerHistoryTitle: 'История расчётов',
  ledgerEmpty: 'Записей пока нет',

  profileOrdersLabel: 'Заказы',
  profileTariffLabel: 'Тарифный план',
  profileDebtLabel: 'Задолженность',
  profileBalanceLabel: 'Баланс',
  profileDebtHint: 'После оплаты администратор внесёт её, и здесь она уменьшится',
  profileNoDebtHint: 'У вас нет задолженности',
  changePasswordLink: '🔑 Сменить пароль',
  changePasswordTitle: 'Смена пароля',
  oldPasswordPlaceholder: 'Старый пароль',
  newPasswordPlaceholder: 'Новый пароль',
  confirmPasswordPlaceholder: 'Новый пароль (подтверждение)',
  passwordTooShort: 'Новый пароль должен содержать не менее 6 символов',
  passwordMismatch: 'Новые пароли не совпадают',
  oldPasswordWrong: 'Старый пароль неверен',
  passwordChanged: '✅ Пароль изменён',

  statusNew: 'Ожидание',
  statusConfirmed: 'Принят',
  statusPicking: 'Собирается',
  statusDone: 'Завершён',
  statusCancelled: 'Отменён',

  kindOrderDebt: 'Заказ',
  kindPayment: 'Оплата',
  kindDiscount: 'Скидка',
  kindAdjustment: 'Корректировка',
  kindCancelReversal: 'Отменено',
};

const DICTS: Record<Lang, Record<keyof typeof uz, string>> = { uz, ru };

export type TranslationKey = keyof typeof uz;

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

type LangCtxValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const LangCtx = createContext<LangCtxValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('uz');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'uz' || saved === 'ru') setLangState(saved);
    });
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }

  const value = useMemo<LangCtxValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => interpolate(DICTS[lang][key], params),
    }),
    [lang]
  );

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLanguage(): LangCtxValue {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error('useLanguage LanguageProvider ichida chaqirilishi kerak');
  return ctx;
}
