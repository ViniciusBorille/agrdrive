export default function Logo({ size = "md", variant = "light" }) {
  const dims = {
    sm: { w: 30, h: 33, t: 18 },
    md: { w: 34, h: 37, t: 20 },
    lg: { w: 40, h: 43, t: 23 },
  };
  const { w, h, t } = dims[size] || dims.md;
  const stroke = variant === "dark" ? "#1c6856" : "#ffffff";
  const gold = variant === "dark" ? "#c9a41f" : "#ebc22f";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <svg width={w} height={h} viewBox="0 0 48 52" fill="none">
        <path
          d="M24 3 L43.5 14.5 L43.5 37.5 L24 49 L4.5 37.5 L4.5 14.5 Z"
          stroke={stroke}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="M24 12 V40"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <ellipse cx="24" cy="12.6" rx="2.5" ry="4.7" fill={gold} />
        <ellipse
          cx="18.9"
          cy="20"
          rx="2.5"
          ry="4.2"
          fill={gold}
          transform="rotate(-34 18.9 20)"
        />
        <ellipse
          cx="29.1"
          cy="20"
          rx="2.5"
          ry="4.2"
          fill={gold}
          transform="rotate(34 29.1 20)"
        />
        <ellipse
          cx="19.6"
          cy="27.8"
          rx="2.5"
          ry="4.2"
          fill={gold}
          transform="rotate(-34 19.6 27.8)"
        />
        <ellipse
          cx="28.4"
          cy="27.8"
          rx="2.5"
          ry="4.2"
          fill={gold}
          transform="rotate(34 28.4 27.8)"
        />
      </svg>
      <span
        style={{
          fontSize: t,
          fontWeight: 700,
          letterSpacing: ".5px",
          color: stroke,
        }}
      >
        AGR<span style={{ color: gold }}>DRIVE</span>
      </span>
    </div>
  );
}
