import { C, Stage, Reveal, Eyebrow, Line } from "../design";

export const Local = () => (
  <Stage chapter="LA PROCHAINE ÉTAPE">
    <div style={{ position: "absolute", left: 130, top: 220 }}>
      <Reveal>
        <Eyebrow>ASUS Ascent GX10</Eyebrow>
        <div
          style={{
            fontSize: 102,
            fontWeight: 600,
            lineHeight: 1.13,
            letterSpacing: -5,
          }}
        >
          La même expérience.
          <br />
          <span style={{ color: C.mint }}>L’intelligence en local.</span>
        </div>
      </Reveal>
      <Reveal delay={32}>
        <Line width={160} />
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.5,
            marginTop: 38,
            color: C.muted,
          }}
        >
          Notre objectif : garder les images et les paroles
          <br />
          sur votre propre machine.
        </div>
      </Reveal>
      <Reveal delay={110}>
        <div
          style={{
            marginTop: 50,
            fontSize: 26,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 27,
            display: "flex",
            gap: 80,
          }}
        >
          <div>
            <span style={{ color: C.mint }}>Aujourd’hui</span>
            <br />
            <span style={{ fontSize: 22, color: C.muted }}>
              POC Mac + LG · Codex distant · Whisper local
            </span>
          </div>
          <div>
            <span style={{ color: C.mint }}>À valider sur GX10</span>
            <br />
            <span style={{ fontSize: 22, color: C.muted }}>
              Perception locale · continuité · latence
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  </Stage>
);
