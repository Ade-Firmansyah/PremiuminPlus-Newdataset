import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || 'Terjadi error pada tampilan.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FRONTEND]', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  retry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#070711] px-5 py-8 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
          <div className="rounded-[1.5rem] border border-rose-500/20 bg-rose-500/10 p-6 shadow-2xl shadow-rose-500/10">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Frontend Error</p>
            <h1 className="mt-3 text-2xl font-black">Tampilan sempat crash, tapi aplikasi tetap aman.</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">{this.state.message}</p>
            <button
              type="button"
              onClick={this.retry}
              className="mt-5 rounded-xl bg-brand px-5 py-3 text-sm font-black text-white shadow-lg shadow-brand/20"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }
}
