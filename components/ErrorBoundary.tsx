import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, Terminal, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[CRITICAL] Uncaught error caught by Bugshot ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReboot = (): void => {
    window.location.reload();
  };

  private handleReturnToMenu = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.href = window.location.pathname;
    }
  };

  private handleClearCacheAndReboot = (): void => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('aadish_roulette_settings');
    } catch {
      // Ignore storage errors
    }
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'UNKNOWN INTERNAL SYSTEM EXCEPTION';
      const stack = this.state.error?.stack || this.state.errorInfo?.componentStack || '';

      return (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/95 text-stone-200 font-mono p-4 select-none crt overflow-auto">
          {/* CRT scanlines effect */}
          <div className="crt-overlay opacity-[0.25] pointer-events-none" />
          <div className="vhs-static" />

          <div className="w-full max-w-xl bg-stone-950/95 border-2 border-red-600/80 shadow-[0_0_60px_rgba(239,68,68,0.3)] rounded-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden backdrop-blur-md">
            {/* Ambient Header Glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse" />

            <div className="flex items-center gap-3 border-b border-red-900/60 pb-4">
              <div className="p-2.5 rounded-xl bg-red-955/60 border border-red-500/40 text-red-500 animate-pulse">
                <ShieldAlert size={28} />
              </div>
              <div className="text-left">
                <h1 className="text-base sm:text-lg font-black tracking-[0.2em] text-red-500 uppercase">
                  CRITICAL RUNTIME MALFUNCTION
                </h1>
                <p className="text-[10px] sm:text-xs text-stone-400 font-bold uppercase tracking-widest">
                  TERMINAL EXECUTION HALTED // EXCEPTION CAUGHT
                </p>
              </div>
            </div>

            <div className="space-y-2 text-left">
              <div className="text-[10px] font-black uppercase text-red-400 tracking-wider flex items-center gap-1.5">
                <Terminal size={13} />
                FAULT DIAGNOSTIC:
              </div>
              <div className="p-3 bg-red-955/20 border border-red-900/40 rounded-xl text-red-300 text-xs font-mono break-all leading-relaxed">
                {errorMessage}
              </div>
            </div>

            {stack && (
              <details className="text-left group">
                <summary className="text-[10px] text-stone-500 hover:text-stone-300 font-bold uppercase tracking-widest cursor-pointer transition-colors">
                  [+] INSPECT STACK TRACE
                </summary>
                <pre className="mt-2 p-3 bg-stone-900/70 border border-stone-800 rounded-lg text-[9px] text-stone-400 font-mono overflow-x-auto max-h-36 leading-tight whitespace-pre-wrap">
                  {stack}
                </pre>
              </details>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReboot}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-red-900/30 hover:bg-red-800/50 border border-red-700/60 hover:border-red-500 text-red-200 rounded-xl text-xs font-black tracking-widest uppercase transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-950/40"
              >
                <RotateCcw size={14} />
                REBOOT
              </button>

              <button
                type="button"
                onClick={this.handleReturnToMenu}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-stone-900 hover:bg-stone-850 border border-stone-750 hover:border-stone-600 text-stone-200 rounded-xl text-xs font-black tracking-widest uppercase transition-all active:scale-95 cursor-pointer"
              >
                <Home size={14} />
                MENU
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndReboot}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-amber-950/20 hover:bg-amber-900/40 border border-amber-800/40 hover:border-amber-600 text-amber-300 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all active:scale-95 cursor-pointer"
              >
                <AlertTriangle size={14} />
                PURGE CACHE
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
