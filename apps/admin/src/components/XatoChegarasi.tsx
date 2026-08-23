import { Component, type ErrorInfo, type ReactNode } from 'react';
import { xatoYubor } from '../lib/xatolik';

// React komponentida xato chiqsa, butun panel oq ekranga aylanib qolardi va
// sabab hech qayerda qolmasdi. Endi: xato jurnalga tushadi, foydalanuvchi
// esa tushunarli ekran va "qayta urinish" tugmasini ko'radi.

type Props = { children: ReactNode };
type State = { xato: Error | null };

export default class XatoChegarasi extends Component<Props, State> {
  state: State = { xato: null };

  static getDerivedStateFromError(xato: Error): State {
    return { xato };
  }

  componentDidCatch(xato: Error, info: ErrorInfo) {
    xatoYubor(xato, undefined, { component: info.componentStack?.slice(0, 500) });
  }

  render() {
    if (!this.state.xato) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <div className="text-4xl">😕</div>
          <h1 className="mt-3 text-lg font-extrabold text-gray-900">Nimadir noto'g'ri ketdi</h1>
          <p className="mt-2 text-sm text-gray-500">
            Xatolik haqida xabar yuborildi. Sahifani qayta yuklab ko'ring — takrorlansa,
            xabar bering.
          </p>
          <button
            onClick={() => location.reload()}
            className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90"
          >
            Qayta yuklash
          </button>
        </div>
      </div>
    );
  }
}
