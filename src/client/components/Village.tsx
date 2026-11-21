/** Silhouette originale du village et de son clocher (SVG), utilisée sur l'accueil. */
export const VillageScene = ({ night = true }: { night?: boolean }) => (
  <svg className="village-scene" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f3ead2" stopOpacity="0.55" />
        <stop offset="40%" stopColor="#c9d4e2" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="fog" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#9aa6b5" stopOpacity="0" />
        <stop offset="60%" stopColor="#9aa6b5" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#9aa6b5" stopOpacity="0.03" />
      </linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="14" /></filter>
    </defs>
    {night && <>
      <circle cx="1180" cy="150" r="170" fill="url(#moonGlow)" />
      <circle cx="1180" cy="150" r="46" fill="#ece3cb" opacity="0.92" />
      <circle cx="1166" cy="140" r="9" fill="#d6cbb0" opacity="0.6" />
      <circle cx="1196" cy="166" r="6" fill="#d6cbb0" opacity="0.5" />
      {[[210, 90], [380, 160], [520, 70], [700, 120], [860, 60], [990, 210], [1380, 90], [1480, 190], [90, 210], [620, 230]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 ? 1.1 : 1.7} fill="#e9dec6" opacity={0.35 + (i % 4) * 0.12} />
      ))}
    </>}
    {/* collines lointaines */}
    <path d="M0 470 C 200 420 360 450 520 430 S 860 380 1040 420 1380 400 1600 440 V700 H0z" fill="#16171c" />
    {/* forêt */}
    <path d="M0 500 l30-40 20 30 25-50 22 44 18-26 26 40 20-32 24 38 V700 H0z M1360 500 l26-46 22 34 24-52 20 46 26-30 24 44 22-36 36 40 V700 H1360z" fill="#101114" />
    {/* village */}
    <g fill="#0b0b0d">
      <path d="M180 560 v-60 l45-40 45 40 v60z" />
      <path d="M262 560 v-80 l35-30 35 30 v80z" />
      <path d="M340 560 v-50 l50-38 50 38 v50z" />
      <path d="M430 560 v-70 l30-26 30 26 v70z" />
      {/* église et clocher */}
      <path d="M540 560 v-110 l70-55 70 55 v110z" />
      <path d="M760 560 V260 l-22 0 l62 -130 l62 130 l-22 0 V560z" />
      <path d="M690 560 v-140 h70 v140z" />
      <path d="M860 560 v-90 l40-34 40 34 v90z" />
      <path d="M940 560 v-60 l48-40 48 40 v60z" />
      <path d="M1030 560 v-84 l36-30 36 30 v84z" />
      <path d="M1110 560 v-54 l44-36 44 36 v54z" />
      <path d="M1200 560 v-70 l32-28 32 28 v70z" />
      <rect x="0" y="555" width="1600" height="145" />
    </g>
    {/* cadran du clocher */}
    <circle cx="800" cy="300" r="26" fill="none" stroke="#3b2f25" strokeWidth="3" />
    <circle cx="800" cy="300" r="21" fill="#1b140f" />
    <path d="M800 300 V284 M800 300 L812 306" stroke="#e3ab4d" strokeWidth="2.4" strokeLinecap="round" />
    {/* fenêtres éclairées (chandelles) */}
    <g fill="#e3ab4d" className="windows">
      <rect x="214" y="518" width="10" height="14" rx="1" />
      <rect x="292" y="500" width="9" height="12" rx="1" opacity=".75" />
      <rect x="452" y="512" width="8" height="12" rx="1" />
      <rect x="602" y="480" width="8" height="18" rx="4" opacity=".85" />
      <rect x="902" y="506" width="9" height="13" rx="1" />
      <rect x="1060" y="512" width="9" height="12" rx="1" opacity=".7" />
      <rect x="1226" y="514" width="8" height="12" rx="1" />
      <rect x="796" y="400" width="8" height="16" rx="4" opacity=".9" />
    </g>
    {/* brume */}
    <g className="fog">
      <rect x="-200" y="470" width="2000" height="160" fill="url(#fog)" filter="url(#soft)" />
    </g>
    <g className="fog fog-2">
      <rect x="-200" y="520" width="2000" height="140" fill="url(#fog)" filter="url(#soft)" />
    </g>
  </svg>
);
