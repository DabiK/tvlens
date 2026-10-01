import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { content } from "./content";
export const C = {
  bg: "#07191f",
  panel: "#10232b",
  card: "#172f39",
  line: "#34494e",
  text: "#f2f5ef",
  muted: "#a3b5bb",
  lime: "#d1f58c",
  mint: "#bbdfcd",
  amber: "#ffd2a2",
};
export const font = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
export const mono = '"SF Mono", Menlo, monospace';
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const enter = (frame: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps: 30,
    config: { damping: 22, stiffness: 130, mass: 0.8 },
  });
export const Logo = ({ size = 40 }: { size?: number }) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 800,
      letterSpacing: -size * 0.055,
      whiteSpace: "nowrap",
    }}
  >
    TV<span style={{ color: C.lime }}>Lens</span>
  </div>
);
export const Eyebrow = ({
  children,
  color = C.lime,
}: {
  children: React.ReactNode;
  color?: string;
}) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 21,
      letterSpacing: 3,
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);
export const Pill = ({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) => (
  <div
    style={{
      border: `1px solid ${active ? C.lime : C.line}`,
      background: active ? "#d1f58c16" : "transparent",
      color: active ? C.lime : C.muted,
      padding: "12px 20px",
      borderRadius: 12,
      fontSize: 22,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);
export const Mic = ({ size = 30 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
  </svg>
);
export const Wave = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, height: 35 }}>
      {Array.from({ length: 13 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 6 + Math.abs(Math.sin(f * 0.2 + i * 0.7)) * 25,
            background: C.lime,
            borderRadius: 3,
          }}
        />
      ))}
    </div>
  );
};
export const Claim = ({ compact = false }: { compact?: boolean }) => (
  <div
    style={{
      background: "#bbdfcd0c",
      border: `1px solid ${C.line}`,
      borderLeft: `3px solid ${C.mint}`,
      borderRadius: 14,
      padding: compact ? 22 : 30,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: C.mint,
        fontSize: compact ? 20 : 24,
        marginBottom: 16,
      }}
    >
      <span>✓ Affirmation retrouvée</span>
      <span style={{ fontFamily: mono }}>{content.timestamp} ↗</span>
    </div>
    <div
      style={{
        fontSize: compact ? 28 : 36,
        lineHeight: 1.4,
        letterSpacing: -0.7,
      }}
    >
      « {content.claim} »
    </div>
  </div>
);
export const Source = ({
  second = false,
  highlight = false,
}: {
  second?: boolean;
  highlight?: boolean;
}) => (
  <div
    style={{
      border: `1px solid ${highlight ? C.lime : C.line}`,
      borderRadius: 14,
      padding: "20px 22px",
      display: "flex",
      gap: 18,
      alignItems: "center",
      background: highlight ? "#d1f58c0c" : "#0a1b22",
    }}
  >
    <div style={{ fontSize: 25, color: C.lime }}>▤</div>
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 16,
          letterSpacing: 2,
          color: C.muted,
          marginBottom: 7,
        }}
      >
        INSEE{second ? " · MÉTHODOLOGIE" : " · 18 FÉV. 2022"}
      </div>
      <div style={{ fontSize: 24, fontWeight: 500 }}>
        {second ? content.source2 : content.source1}
      </div>
    </div>
    <span style={{ fontSize: 21, color: C.lime }}>Ouvrir ↗</span>
  </div>
);
export const Answer = ({ compact = false }: { compact?: boolean }) => (
  <div>
    <div
      style={{
        display: "inline-flex",
        gap: 12,
        alignItems: "center",
        color: C.lime,
        background: "#d1f58c13",
        padding: "12px 18px",
        borderRadius: 10,
        fontSize: compact ? 24 : 28,
        fontWeight: 600,
      }}
    >
      ✓ {content.verdict}
    </div>
    <div
      style={{
        fontSize: compact ? 28 : 35,
        lineHeight: 1.48,
        margin: "24px 0 28px",
        letterSpacing: -0.5,
      }}
    >
      {content.answer}
    </div>
    <div
      style={{
        fontSize: 18,
        color: C.muted,
        letterSpacing: 2,
        marginBottom: 14,
      }}
    >
      SOURCES CONSULTABLES
    </div>
    <div style={{ display: "grid", gap: 12 }}>
      <Source />
      <Source second />
    </div>
  </div>
);
export const Input = ({
  text = "",
  listening = false,
}: {
  text?: string;
  listening?: boolean;
}) => (
  <div
    style={{
      padding: 22,
      border: `2px solid ${C.lime}`,
      borderRadius: 18,
      background: "#102730",
    }}
  >
    <div
      style={{ display: "flex", gap: 20, alignItems: "center", minHeight: 62 }}
    >
      <div
        style={{
          flex: 1,
          fontSize: 27,
          lineHeight: 1.3,
          color: text ? C.text : C.muted,
        }}
      >
        {text || "Pose ta question…"}
      </div>
      <div
        style={{
          borderRadius: 14,
          background: C.lime,
          color: C.bg,
          padding: 15,
          display: "flex",
        }}
      >
        {listening ? (
          <Mic />
        ) : (
          <span style={{ fontSize: 28, lineHeight: 1 }}>↗</span>
        )}
      </div>
    </div>
    <div style={{ marginTop: 15, fontSize: 18, color: C.muted }}>
      {listening ? "Dictée en cours…" : "Ta question sur ce moment"}
    </div>
  </div>
);
export const Sidebar = ({
  stage = 0,
  question = "",
}: {
  stage?: number;
  question?: string;
}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      background: C.panel,
      padding: "32px 30px",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      borderLeft: `1px solid ${C.line}`,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Logo size={37} />
      <Pill>Frise ↔</Pill>
    </div>
    <div style={{ color: C.mint, fontSize: 18, margin: "24px 0 30px" }}>
      ● Contexte de la vidéo disponible
    </div>
    <div style={{ display: "grid", gap: 25 }}>
      {stage >= 1 && stage < 3 && (
        <div
          style={{
            background: C.card,
            borderRadius: 16,
            padding: 23,
            fontSize: 28,
            lineHeight: 1.35,
          }}
        >
          C’est vrai ce qu’il vient de dire ?
        </div>
      )}
      {stage >= 2 && <Claim compact />}
      {stage >= 3 && (
        <div>
          <div
            style={{
              fontSize: 27,
              color: C.lime,
              fontWeight: 650,
              marginBottom: 18,
            }}
          >
            ✓ {content.verdict}
          </div>
          <div style={{ fontSize: 25, lineHeight: 1.45, marginBottom: 24 }}>
            {content.answer}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <Source />
            <Source second />
          </div>
        </div>
      )}
    </div>
    <div style={{ marginTop: "auto", paddingTop: 24 }}>
      <Input text={question} listening={stage === 0 && !!question} />
    </div>
  </div>
);
export const Reveal = ({
  children,
  delay = 0,
  style = {},
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 23 } });
  return (
    <div
      style={{
        opacity: interpolate(f, [delay, delay + 12], [0, 1], clamp),
        translate: `0 ${24 * (1 - p)}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
