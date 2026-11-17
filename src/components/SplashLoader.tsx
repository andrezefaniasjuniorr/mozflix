interface SplashLoaderProps {
  fadingOut?: boolean;
  label?: string;
}

export function SplashLoader({ fadingOut = false, label = 'A carregar...' }: SplashLoaderProps) {
  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#0A0A0C] flex flex-col items-center justify-center select-none transition-opacity duration-300 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="A carregar MozFlix"
    >
      {/* Fundo radial discreto */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(229, 9, 20, 0.14) 0%, rgba(10, 10, 12, 0.96) 55%, #0A0A0C 100%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* Aura pulsante + brilhos + M */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          {/* Aura externa pulsante */}
          <div
            className="animate-moz-aura absolute inset-2 rounded-full blur-2xl pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(229,9,20,0.65) 0%, rgba(178,7,16,0.2) 55%, transparent 75%)',
            }}
          />

          {/* Estrelas / pontos de brilho */}
          <svg
            viewBox="0 0 24 24"
            className="animate-moz-sparkle-1 absolute -top-1 right-2 w-4 h-4 text-white pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0L14.3 9.7L24 12L14.3 14.3L12 24L9.7 14.3L0 12L9.7 9.7L12 0Z" />
          </svg>

          <svg
            viewBox="0 0 24 24"
            className="animate-moz-sparkle-2 absolute bottom-3 -left-2 w-3 h-3 text-red-200 pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0L14.3 9.7L24 12L14.3 14.3L12 24L9.7 14.3L0 12L9.7 9.7L12 0Z" />
          </svg>

          <svg
            viewBox="0 0 24 24"
            className="animate-moz-sparkle-3 absolute top-4 -left-1 w-2.5 h-2.5 text-white/90 pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0L14.3 9.7L24 12L14.3 14.3L12 24L9.7 14.3L0 12L9.7 9.7L12 0Z" />
          </svg>

          {/* Emblema M animado com brilho deslizante */}
          <div className="animate-moz-m relative w-24 h-24 overflow-hidden flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="110 104 292 304"
              className="w-full h-full"
              fill="none"
            >
              <defs>
                <linearGradient id="mozMGrad" x1="126" y1="120" x2="386" y2="392" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FF242E" />
                  <stop offset="50%" stopColor="#E50914" />
                  <stop offset="100%" stopColor="#99040C" />
                </linearGradient>
                <linearGradient id="mozMShadow" x1="126" y1="120" x2="256" y2="392" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7F0309" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#B20710" stopOpacity="0.45" />
                </linearGradient>
                <clipPath id="mozMClip">
                  <path d="M126 392V120H188L256 248L324 120H386V392H324V222L272 320H240L188 222V392H126Z" />
                </clipPath>
              </defs>

              {/* Base do M */}
              <path
                d="M126 392V120H188L256 248L324 120H386V392H324V222L272 320H240L188 222V392H126Z"
                fill="url(#mozMGrad)"
              />
              {/* Dobra tridimensional estilo cinema */}
              <path
                d="M126 392L188 120L256 248L188 222V392H126Z"
                fill="url(#mozMShadow)"
              />
              <path
                d="M324 120H386V392H324V222L256 248L324 120Z"
                fill="#FF4A53"
                opacity="0.18"
              />

              {/* Reflexo / brilho diagonal animado dentro da silhueta do M */}
              <g clipPath="url(#mozMClip)">
                <rect
                  x="110"
                  y="90"
                  width="76"
                  height="340"
                  fill="url(#mozShineBand)"
                  className="animate-moz-shine"
                />
              </g>
              <defs>
                <linearGradient id="mozShineBand" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                  <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.72" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Barra de carregamento luminosa + texto por baixo do M */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-32 h-[3px] rounded-full bg-white/10 overflow-hidden">
            <div
              className="animate-moz-bar h-full w-14 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, rgba(229,9,20,0.1) 0%, #E50914 55%, #FFFFFF 100%)',
                boxShadow: '0 0 12px rgba(229, 9, 20, 0.9)',
              }}
            />
          </div>
          <span className="text-[11px] font-medium tracking-[0.18em] uppercase text-zinc-400">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
