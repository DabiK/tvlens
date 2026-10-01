import { useCurrentFrame } from "remotion";
import { C, Stage, Reveal, Screen, Footer, ramp } from "../design";

export const Television = () => {
  const f = useCurrentFrame();
  const timeline = ramp(f, 140, 167);
  return (
    <Stage chapter="02 / RETROUVER">
      <Reveal style={{ position: "absolute", left: 100, top: 128 }}>
        <div style={{ fontSize: 65, fontWeight: 600, letterSpacing: -3 }}>
          Sur la TV. <span style={{ color: C.mint }}>Sans perdre le fil.</span>
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 275,
          top: 225,
          width: 1370,
          height: 771,
          transform: `scale(${0.96 + ramp(f, 0, 40) * 0.04})`,
          transformOrigin: "top center",
          border: `1px solid ${C.line}`,
          borderRadius: 17,
          overflow: "hidden",
          boxShadow: "0 25px 70px #0008",
        }}
      >
        <Screen src="lg-chat.png" />
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(${(1 - timeline) * 100}% 0 0 0)`,
          }}
        >
          <Screen src="lg-timeline.png" />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 150,
          top: 182,
          padding: "13px 25px",
          borderRadius: 40,
          background: C.mint,
          color: C.ink,
          fontSize: 22,
          fontWeight: 650,
        }}
      >
        {f < 148 ? "Dictez votre question" : "Parcourez votre mémoire"}
      </div>
      <Footer>
        <span style={{ background: C.ink, padding: "6px 12px" }}>
          Companion LG · YouTube · TV rootée de test
        </span>
        <span />
      </Footer>
    </Stage>
  );
};
