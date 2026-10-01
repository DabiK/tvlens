import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, Claim, Eyebrow, Reveal, clamp, enter, font } from "../ui";
import { Footage } from "./Watching";
export const Context = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.text, fontFamily: font }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.13,
          filter: "blur(7px)",
          scale: 1.03,
        }}
      >
        <Footage start={73} />
      </div>
      <div style={{ position: "absolute", left: 130, top: 140, width: 730 }}>
        <Reveal>
          <Eyebrow>LE BON PASSAGE. AUTOMATIQUEMENT.</Eyebrow>
          <div
            style={{
              fontSize: 91,
              fontWeight: 600,
              letterSpacing: -4,
              lineHeight: 1.03,
              marginTop: 38,
            }}
          >
            Il sait déjà
            <br />
            de quoi
            <br />
            <span style={{ color: C.mint }}>tu parles.</span>
          </div>
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 1000, top: 185, width: 730 }}>
        <Reveal>
          <div
            style={{
              fontSize: 31,
              color: C.muted,
              background: C.card,
              padding: 25,
              borderRadius: 17,
            }}
          >
            « C’est vrai ce qu’il vient de dire ? »
          </div>
        </Reveal>
        <div style={{ height: 88, display: "flex", justifyContent: "center" }}>
          <div
            style={{ height: 88 * enter(f, 13), width: 2, background: C.mint }}
          />
        </div>
        <Reveal delay={18}>
          <Claim />
        </Reveal>
        <div style={{ height: 76, display: "flex", justifyContent: "center" }}>
          <div
            style={{ height: 76 * enter(f, 35), width: 2, background: C.mint }}
          />
        </div>
        <Reveal delay={39}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              fontSize: 27,
              color: C.mint,
            }}
          >
            <div
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                padding: "17px 24px",
              }}
            >
              ▤ Sources
            </div>
            <span style={{ opacity: interpolate(f, [40, 70], [0, 1], clamp) }}>
              Le contexte devient une recherche.
            </span>
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 130,
          fontSize: 23,
          color: C.muted,
        }}
      >
        Ta question suffit. La vidéo donne le contexte.
      </div>
    </AbsoluteFill>
  );
};
