import React from 'react';

export default function Logo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 120 120" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background Shadow Glow of the logo */}
      <circle cx="60" cy="60" r="48" fill="rgba(77, 77, 255, 0.08)" />
      
      {/* 3D-like Stamp Neck & Handle base */}
      {/* Top Handle Knob */}
      <ellipse cx="60" cy="22" rx="20" ry="7" fill="url(#knobGradient)" />
      <path d="M 40 22 C 40 25, 80 25, 80 22 L 80 26 C 80 29, 40 29, 40 26 Z" fill="#09090b" />
      <ellipse cx="60" cy="26" rx="20" ry="6" fill="#18181b" stroke="#3f3f46" strokeWidth="0.5" />

      {/* Vertical Connecting Column Neck */}
      <rect x="54" y="26" width="12" height="15" fill="url(#columnGradient)" />
      
      {/* Stamp Body Base/Cap */}
      <path d="M 46 41 C 46 38, 74 38, 74 41 L 76 45 C 76 47, 44 47, 44 45 Z" fill="#27272a" />

      {/* Deep Body Base Dome (The stamp body behind the note) */}
      <path 
        d="M 36 75 C 36 45, 84 45, 84 75" 
        stroke="url(#bodyGradient)" 
        strokeWidth="14" 
        strokeLinecap="round" 
      />
      <path 
        d="M 35 76 C 35 48, 85 48, 85 76 Z" 
        fill="url(#bodyGradient)" 
      />

      {/* ANGRY INTENT EYES */}
      {/* Left Eyebrow (slanted, angry) */}
      <path d="M 46 54 L 56 58" stroke="#101014" strokeWidth="2.5" strokeLinecap="round" />
      {/* Right Eyebrow (slanted, angry) */}
      <path d="M 74 54 L 64 58" stroke="#101014" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Left Eye */}
      <circle cx="52" cy="62" r="5" fill="#ffffff" />
      <circle cx="53" cy="62" r="2.5" fill="#101014" />
      <circle cx="54" cy="61" r="0.8" fill="#ffffff" /> {/* Eye light reflection */}

      {/* Right Eye */}
      <circle cx="68" cy="62" r="5" fill="#ffffff" />
      <circle cx="67" cy="62" r="2.5" fill="#101014" />
      <circle cx="66" cy="61" r="0.8" fill="#ffffff" /> {/* Eye light reflection */}

      {/* YELLOW STICKY NOTE (Squeezed List Document) */}
      {/* Golden/Warm Yellow note sheet */}
      <path 
        d="M 34 66 
           L 86 66 
           L 84 98 
           C 84 98, 76 102, 70 102 
           C 64 102, 62 106, 52 106 
           C 42 106, 34 100, 34 98 
           Z" 
        fill="url(#noteGradient)"
        filter="url(#dropShadow)"
      />
      
      {/* Bottom Curled Page Corner Overlay Effect */}
      <path 
        d="M 70 102
           C 74 101, 84 98, 84 98
           L 78 93
           C 74 93, 70 97, 70 102"
        fill="#b45309"
        opacity="0.35"
      />
      <path 
        d="M 71 101
           C 74 100, 80 97, 80 97
           L 75 94
           C 72 94, 71 97, 71 101"
        fill="#fef08a"
      />

      {/* Checklist items detailed on paper */}
      {/* Item 1 Checkbox (Checked) */}
      <rect x="40" y="72" width="6" height="6" rx="1.2" fill="none" stroke="#451a03" strokeWidth="1" />
      <path d="M 41 75 L 42.5 76.5 L 45 73.5" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="49" y1="75" x2="80" y2="75" stroke="#451a03" strokeWidth="1" strokeLinecap="round" opacity="0.85" />

      {/* Item 2 Checkbox (Checked) */}
      <rect x="40" y="81" width="6" height="6" rx="1.2" fill="none" stroke="#451a03" strokeWidth="1" />
      <path d="M 41 84 L 42.5 85.5 L 45 82.5" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="49" y1="84" x2="76" y2="84" stroke="#451a03" strokeWidth="1" strokeLinecap="round" opacity="0.85" />

      {/* Item 3 Checkbox (Blank/Unchecked) */}
      <rect x="40" y="90" width="6" height="6" rx="1.2" fill="none" stroke="#451a03" strokeWidth="1" />
      <line x1="49" y1="93" x2="68" y2="93" stroke="#451a03" strokeWidth="1" strokeLinecap="round" opacity="0.85" />

      {/* TWO CUTE BLACK HANDS / CLAW GRIPS PINCHING THE STICKY NOTE */}
      {/* Left Hand Gripping Side */}
      <path 
        d="M 34 76 
           C 30 76, 28 70, 31 66 
           C 33 63, 37 65, 36 71 
           Z" 
        fill="#18181b" 
        stroke="#27272a" 
        strokeWidth="0.5" 
      />
      
      {/* Right Hand Gripping Side */}
      <path 
        d="M 86 76 
           C 90 76, 92 70, 89 66 
           C 87 63, 83 65, 84 71 
           Z" 
        fill="#18181b" 
        stroke="#27272a" 
        strokeWidth="0.5" 
      />

      {/* Gradients and Filters definition definitions */}
      <defs>
        <radialGradient id="knobGradient" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#52525b" />
          <stop offset="60%" stopColor="#1f1f23" />
          <stop offset="100%" stopColor="#09090b" />
        </radialGradient>
        
        <linearGradient id="columnGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#18181b" />
          <stop offset="40%" stopColor="#3f3f46" />
          <stop offset="70%" stopColor="#27272a" />
          <stop offset="100%" stopColor="#09090b" />
        </linearGradient>

        <linearGradient id="bodyGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f3f46" />
          <stop offset="70%" stopColor="#18181b" />
          <stop offset="100%" stopColor="#09090b" />
        </linearGradient>

        <linearGradient id="noteGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>

        <filter id="dropShadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.2" />
        </filter>
      </defs>
    </svg>
  );
}
