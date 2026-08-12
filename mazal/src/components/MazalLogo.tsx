import React from "react";

interface MazalLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
}

export const MazalLogo: React.FC<MazalLogoProps> = ({
  className = "",
  size = "md",
  showSubtitle = true,
}) => {
  // Dimensions based on size preset
  const dimensions = {
    sm: { width: "140px", height: "40px", emblemSize: 28, titleSize: "text-lg", subSize: "text-[6px]" },
    md: { width: "220px", height: "60px", emblemSize: 42, titleSize: "text-2xl", subSize: "text-[9px]" },
    lg: { width: "300px", height: "80px", emblemSize: 56, titleSize: "text-4xl", subSize: "text-[11px]" },
    xl: { width: "420px", height: "110px", emblemSize: 76, titleSize: "text-5xl", subSize: "text-[14px]" },
  }[size];

  return (
    <div 
      className={`flex items-center gap-3 select-none ${className}`}
      style={{ width: "fit-content" }}
      id={`mazal-logo-${size}`}
    >
      {/* Emblem SVG: Star inside circular sweep with aerodynamic wings */}
      <svg
        width={dimensions.emblemSize}
        height={dimensions.emblemSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_2px_4px_rgba(132,204,22,0.2)]"
      >
        <defs>
          {/* Lime/Green gradients matching the uploaded brand asset */}
          <linearGradient id="emblemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d9f99d" /> {/* lime-200 */}
            <stop offset="50%" stopColor="#a3e635" /> {/* lime-400 */}
            <stop offset="100%" stopColor="#65a30d" /> {/* lime-700 */}
          </linearGradient>
          <linearGradient id="wingGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4d7c0f" /> {/* lime-800 */}
            <stop offset="100%" stopColor="#bef264" /> {/* lime-300 */}
          </linearGradient>
        </defs>

        {/* Outer Circular Swoosh (Aerodynamic curve) */}
        <path
          d="M 15,50 A 35,35 0 1,1 85,50 A 35,35 0 0,1 35,82"
          stroke="url(#wingGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />

        {/* Dynamic Stylized Wings sweeping around */}
        <path
          d="M 10,75 C 20,85 35,82 48,70 C 60,58 72,52 82,65 C 65,45 50,42 38,52 C 26,62 15,65 10,75 Z"
          fill="url(#emblemGrad)"
        />
        <path
          d="M 5,60 C 15,72 28,68 38,58 C 48,48 58,42 68,52 C 52,32 38,30 28,40 C 18,50 8,52 5,60 Z"
          fill="url(#wingGrad)"
          opacity="0.7"
        />

        {/* Core Star Emblem */}
        <polygon
          points="50,18 58,35 77,36 62,48 67,67 50,56 33,67 38,48 23,36 42,35"
          fill="url(#emblemGrad)"
          stroke="#4d7c0f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Highlight inner dot */}
        <circle cx="50" cy="40" r="3" fill="#ffffff" opacity="0.9" />
      </svg>

      {/* Typography block */}
      <div className="flex flex-col justify-center">
        {/* "MaZaL" stylized brand word */}
        <h1 
          className={`font-black tracking-tighter ${dimensions.titleSize} select-none leading-none flex items-baseline`}
          style={{ fontFamily: '"Space Grotesk", sans-serif' }}
        >
          <span className="text-slate-900 dark:text-white mr-px">M</span>
          <span className="text-lime-500 dark:text-lime-400">a</span>
          <span className="text-slate-900 dark:text-white mr-px">Z</span>
          <span className="text-lime-500 dark:text-lime-400">a</span>
          <span className="text-slate-900 dark:text-white">L</span>
        </h1>

        {/* Corporate subtitle "DISTRIBUIDORA Y SERVICIOS C.A." */}
        {showSubtitle && (
          <span 
            className={`font-extrabold tracking-[0.16em] text-slate-700 dark:text-slate-300 ${dimensions.subSize} uppercase font-sans mt-1 whitespace-nowrap`}
          >
            DISTRIBUIDORA Y SERVICIOS C.A.
          </span>
        )}
      </div>
    </div>
  );
};
