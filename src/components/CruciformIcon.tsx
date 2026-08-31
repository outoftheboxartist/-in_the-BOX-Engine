import React from "react";

export function CruciformIcon({ className = "w-5 h-5", glow = false }: { className?: string; glow?: boolean }) {
  return (
    <svg className={`${className} ${glow ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" : ""}`} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Top Square with subtle hammered texture simulation/gradient */}
      <rect x="35" y="5" width="30" height="30" fill="url(#cruciform-metallic)" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Left Square */}
      <rect x="5" y="35" width="30" height="30" fill="url(#cruciform-metallic)" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Right Square */}
      <rect x="65" y="35" width="30" height="30" fill="url(#cruciform-metallic)" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Bottom Square */}
      <rect x="35" y="65" width="30" height="30" fill="url(#cruciform-metallic)" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Center Square (Black/Empty border outline) */}
      <rect x="35" y="35" width="30" height="30" fill="#000000" stroke="#FFFFFF" strokeWidth="1.5" />
      
      <defs>
        {/* Metallic/Foil texture gradient */}
        <linearGradient id="cruciform-metallic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="30%" stopColor="#b0b0b0" />
          <stop offset="50%" stopColor="#505050" />
          <stop offset="70%" stopColor="#e0e0e0" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
      </defs>
    </svg>
  );
}
