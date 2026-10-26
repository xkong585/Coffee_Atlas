/** An original decorative illustration, not geographic data or an interactive map. */
export function CoffeeGlobe({ compact = false }: { compact?: boolean }) {
  return (
    <svg className={compact ? "coffee-globe coffee-globe-compact" : "coffee-globe"} viewBox="0 0 560 500" fill="none" role="img" aria-label="A coffee cup drawn across an illustrated globe">
      <circle cx="287" cy="237" r="171" fill="#E9EBDD" />
      <g stroke="#697361" strokeWidth="1.15" opacity=".6">
        <circle cx="272" cy="226" r="170" />
        <ellipse cx="272" cy="226" rx="83" ry="170" />
        <ellipse cx="272" cy="226" rx="139" ry="170" />
        <path d="M102 226h340M272 56v340" />
        <ellipse cx="272" cy="226" rx="170" ry="72" />
        <path d="M129 134c76 26 210 26 286 0M129 318c76-26 210-26 286 0" />
      </g>
      <g stroke="#41463C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M174 205c20-7 46-13 73-15 39-4 75-1 112 11l-5 64c-3 40-32 65-85 65-45 0-73-20-80-53l-15-72Z" fill="#F7F6F3" />
        <path d="M359 211c57-10 60 57 9 62l-15 1" />
        <path d="M358 225c33-7 35 27 5 32l-7 1" />
        <ellipse cx="267" cy="204" rx="93" ry="18" fill="#E6D0BE" />
        <path d="M190 207c33-17 108-20 153-4" stroke="#93634C" />
        <path d="M221 160c-20-28 22-26 5-56M261 154c-17-23 21-29 9-52M299 157c-16-21 19-27 9-47" stroke="#7D8572" />
        <path d="M165 333c8 23 56 42 112 42s108-19 116-42" fill="#F7F6F3" />
        <path d="M189 320c-45 2-64 10-64 19 0 15 67 28 150 28s150-13 150-28c0-10-24-19-62-23" />
      </g>
      <g fill="#8B4F36">
        <circle cx="142" cy="119" r="5" />
        <circle cx="412" cy="298" r="5" />
        <circle cx="207" cy="388" r="5" />
      </g>
      <g stroke="#8B4F36" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 6">
        <path d="M142 119C83 68 44 148 91 187" />
        <path d="M412 298c63 34 93-28 56-62" />
      </g>
      <g stroke="#697361" strokeWidth="1.3" strokeLinecap="round">
        <path d="M451 107v16M443 115h16M96 342v12M90 348h12" />
      </g>
      <text x="272" y="455" textAnchor="middle" fill="#6C6C60" fontSize="10" letterSpacing="3" fontFamily="monospace">MANY PLACES. MANY WAYS TO ENJOY.</text>
    </svg>
  );
}
