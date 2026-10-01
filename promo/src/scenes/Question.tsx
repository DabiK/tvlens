import { useCurrentFrame } from "remotion";
import { C, Stage, Reveal, Eyebrow, ramp } from "../design";

export const Question = () => {
  const f = useCurrentFrame();
  return (
    <Stage light chapter="UNE QUESTION SUFFIT">
      <div style={{ position: "absolute", left: 130, top: 245 }}>
        <Reveal>
          <Eyebrow light>Vous regardez. Une question vous vient.</Eyebrow>
        </Reveal>
        <Reveal delay={10}>
          <div
            style={{
              fontSize: 106,
              lineHeight: 1.15,
              fontWeight: 650,
              letterSpacing: -5,
            }}
          >
            « Qu’est-ce qu’il disait
            <br />
            il y a deux minutes ? »
          </div>
        </Reveal>
        <Reveal delay={52}>
          <div style={{ fontSize: 36, marginTop: 50, color: "#5b6b64" }}>
            TVLens retrouve le contexte de votre question.
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 135,
          right: 135,
          bottom: 172,
          display: "flex",
          alignItems: "center",
          gap: 25,
          opacity: ramp(f, 65, 85),
        }}
      >
        <span style={{ fontSize: 22, color: "#5b6b64" }}>IL Y A 2 MIN</span>
        <div
          style={{
            height: 2,
            flex: 1,
            background: "#bbc9bd",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: `${ramp(f, 70, 145) * 76}%`,
              top: -8,
              width: 18,
              height: 18,
              borderRadius: 20,
              background: C.ink,
            }}
          />
        </div>
        <span style={{ fontSize: 22 }}>MAINTENANT</span>
      </div>
    </Stage>
  );
};
