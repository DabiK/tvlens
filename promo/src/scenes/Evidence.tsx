import { useCurrentFrame } from "remotion";
import { C, Stage, Reveal, Eyebrow, ramp } from "../design";

export const Evidence = () => {
  const f = useCurrentFrame();
  return (
    <Stage light chapter="03 / VÉRIFIER">
      <Reveal style={{ position: "absolute", left: 130, top: 190 }}>
        <Eyebrow light>Gardez votre esprit critique</Eyebrow>
        <div style={{ fontSize: 103, fontWeight: 650, letterSpacing: -5 }}>
          « Tu as une source ? »
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 135,
          right: 135,
          top: 510,
          display: "flex",
          gap: 55,
        }}
      >
        {["Le passage", "La recherche", "Les sources"].map((title, i) => (
          <div
            key={title}
            style={{
              flex: 1,
              opacity: ramp(f, 28 + i * 20, 50 + i * 20),
              transform: `translateY(${(1 - ramp(f, 28 + i * 20, 58 + i * 20)) * 35}px)`,
            }}
          >
            <div style={{ fontSize: 21, color: "#658271", marginBottom: 25 }}>
              0{i + 1}
            </div>
            <div
              style={{ height: 2, background: "#afc2b5", marginBottom: 32 }}
            />
            <div style={{ fontSize: 45, fontWeight: 650, letterSpacing: -1.5 }}>
              {title}
            </div>
            <div
              style={{
                fontSize: 26,
                lineHeight: 1.5,
                marginTop: 20,
                color: "#53685b",
              }}
            >
              {
                [
                  "Retrouver ce qui a été dit.",
                  "Chercher des éléments externes.",
                  "Examiner les preuves disponibles.",
                ][i]
              }
            </div>
          </div>
        ))}
      </div>
      <Reveal
        delay={100}
        style={{
          position: "absolute",
          bottom: 140,
          left: 135,
          fontSize: 32,
          color: C.ink,
        }}
      >
        Ce que montre la vidéo{" "}
        <span style={{ color: "#658271", margin: "0 20px" }}>≠</span> ce qui est
        établi.
      </Reveal>
    </Stage>
  );
};
