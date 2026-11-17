import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[MozFlix Background]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-[#141418] border border-white/10 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#E50914]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="font-display text-xl font-bold tracking-tight text-white">
                Algo correu mal
              </h1>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Ocorreu uma falha temporária. Toca abaixo para continuar.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#E50914] hover:bg-[#B20710] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
