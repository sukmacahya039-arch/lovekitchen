import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'Unexpected error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Love Kitchen ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF6EC] p-6 text-[#3B2318]">
          <div className="max-w-md w-full rounded-2xl bg-white border border-[#3B2318]/15 p-6 shadow-lg text-center">
            <h1 className="font-display text-2xl font-bold text-[#FF5A6E]">Dapur Sedang Rehat</h1>
            <p className="mt-2 text-sm text-[#5C3A28]">
              Terjadi kesalahan tak terduga. Muat ulang permainan untuk kembali memasak.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-6 py-2.5 rounded-xl bg-[#FF5A6E] text-white font-bold hover:bg-[#E8485C] transition cursor-pointer"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
