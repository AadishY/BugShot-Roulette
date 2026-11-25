import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in BugShot Roulette:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReturnToMenu = () => {
    try {
      this.setState({ hasError: false, error: null, errorInfo: null });
      window.location.href = window.location.pathname;
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] bg-[#0a0908] text-stone-200 flex items-center justify-center p-4 font-mono select-none overflow-y-auto">
          <div className="w-full max-w-lg bg-stone-950 border border-red-900/60 rounded-2xl p-6 sm:p-8 shadow-[0_0_60px_rgba(220,38,38,0.2)] space-y-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />

            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] text-red-500/80 uppercase tracking-[0.25em] font-black">
                  TERMINAL RECOVERY // FAULT DETECTED
                </div>
                <h1 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider mt-0.5">
                  SYSTEM INTERRUPTED
                </h1>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-stone-400 leading-relaxed">
              An unexpected error interrupted this screen. Your match record and account data remain safely stored.
            </p>

            {this.state.error && (
              <div className="bg-black/80 border border-stone-800/80 rounded-xl p-3 text-[10px] text-red-300/90 overflow-x-auto max-h-28 overflow-y-auto">
                <div className="font-bold text-red-400 uppercase tracking-wider mb-1">ERROR TRACE</div>
                <code className="break-all">{this.state.error.message || String(this.state.error)}</code>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                REBOOT
              </button>

              <button
                onClick={this.handleReturnToMenu}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
