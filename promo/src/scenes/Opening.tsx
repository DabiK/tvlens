import { useCurrentFrame } from "remotion";
import { C, Stage, Reveal, ramp } from "../design";

export const Opening = () => {
  const f = useCurrentFrame();
  return (
    <Stage chapter="VOTRE COMPAGNON DE VISIONNAGE">
      <div style={{ position: "absolute", left: 130, top: 260 }}>
        <Reveal>
          <div
            style={{
              fontSize: 106,
              fontWeight: 500,
              letterSpacing: -6,
              lineHeight: 1.14,
            }}
          >
            La vidéo continue.
          </div>
        </Reveal>
        <Reveal delay={35}>
          <div
            style={{
              fontSize: 128,
              fontWeight: 750,
              letterSpacing: -7,
              lineHeight: 1.2,
              color: C.mint,
            }}
          >
            Le contexte reste.
          </div>
        </Reveal>
        <Reveal delay={75}>
          <div style={{ fontSize: 33, color: C.muted, marginTop: 45 }}>
            Demandez. Retrouvez. Explorez les preuves.
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 132,
          right: 132,
          bottom: 170,
          height: 1,
          background: C.line,
        }}
      >
        <div
          style={{
            width: `${ramp(f, 35, 170) * 100}%`,
            height: 2,
            background: C.mint,
          }}
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${i * 20}%`,
              top: -5,
              width: 11,
              height: 11,
              borderRadius: 11,
              background: C.mint,
              opacity: ramp(f, 35 + i * 18, 50 + i * 18),
            }}
          />
        ))}
      </div>
    </Stage>
  );
};
