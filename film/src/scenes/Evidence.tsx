import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  Answer,
  C,
  Claim,
  Eyebrow,
  Logo,
  Reveal,
  clamp,
  enter,
  font,
  mono,
} from "../ui";
import { Footage } from "./Watching";
export const Evidence = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.text, fontFamily: font }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 910,
          overflow: "hidden",
        }}
      >
        <Footage start={78} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(0deg,#07191fee,transparent 95%)",
          }}
        />
        <div
          style={{ position: "absolute", left: 100, right: 60, bottom: 120 }}
        >
          <Eyebrow>DU CONTEXTE AUX PREUVES</Eyebrow>
          <div
            style={{
              fontSize: 75,
              fontWeight: 600,
              letterSpacing: -3,
              lineHeight: 1.05,
              marginTop: 30,
            }}
          >
            Un chiffre.
            <br />
            Son périmètre.
            <br />
            <span style={{ color: C.mint }}>Ses sources.</span>
          </div>
          <div style={{ fontSize: 22, color: C.muted, marginTop: 35 }}>
            La vidéo continue.
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 910,
          top: 0,
          right: 0,
          bottom: 0,
          padding: "58px 76px",
          background: C.panel,
          borderLeft: `1px solid ${C.line}`,
        }}
      >
        <Logo />
        <div style={{ marginTop: 35 }}>
          <Claim compact />
        </div>
        <Reveal delay={9} style={{ marginTop: 36 }}>
          <Answer />
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};
export const SourceFocus = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        fontFamily: font,
        color: C.text,
        padding: "65px 130px",
      }}
    >
      <Eyebrow>SOURCE CONSULTABLE</Eyebrow>
      <div
        style={{
          position: "absolute",
          left: 215,
          top: 150,
          width: 1490,
          height: 790,
          background: "#f3f4ee",
          color: "#142e36",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 30px 100px #0007",
          scale: interpolate(f, [0, 24], [0.96, 1], clamp),
          translate: `0 ${35 * (1 - enter(f))}px`,
        }}
      >
        <div
          style={{
            height: 64,
            background: "#e1e5df",
            display: "flex",
            alignItems: "center",
            padding: "0 35px",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#a6afa9",
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#a6afa9",
            }}
          />
          <div style={{ fontSize: 20, textAlign: "center", flex: 1 }}>
            insee.fr/fr/statistiques/6051733 ↗
          </div>
        </div>
        <div style={{ padding: "55px 85px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 43, fontWeight: 800, letterSpacing: -2 }}>
              insee
            </div>
            <div style={{ fontFamily: mono, fontSize: 18 }}>
              INFORMATIONS RAPIDES · 18.02.2022
            </div>
          </div>
          <div
            style={{
              marginTop: 40,
              fontSize: 52,
              letterSpacing: -1.6,
              fontWeight: 600,
              lineHeight: 1.12,
            }}
          >
            Chômage en France :<br />
            les résultats de fin 2021
          </div>
          <div style={{ height: 1, background: "#bcc7bf", margin: "35px 0" }} />
          <div style={{ fontSize: 31, lineHeight: 1.55 }}>
            Taux de chômage au sens du BIT
            <br />
            <span
              style={{
                background: `linear-gradient(90deg,#d1f58c ${interpolate(f, [20, 48], [0, 100], clamp)}%,transparent 0%)`,
                padding: "7px 0",
              }}
            >
              « 7,4 % de la population active
            </span>
            <br />
            en France (hors Mayotte). »
          </div>
          <div style={{ fontSize: 18, color: "#60716d", marginTop: 28 }}>
            Extrait de la publication Insee · mise en page adaptée
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
