import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || 'Aplikasi gagal dimuat.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[UI_ERROR]', { error, info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
          <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-rose-300">Premiumin Plus</p>
            <h1 className="mt-3 text-2xl font-black">Halaman gagal dimuat</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white"
            >
              Muat ulang
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
