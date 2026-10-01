import { useCurrentFrame } from "remotion";
import { C, Stage, Reveal, Eyebrow, Screen, Footer, ramp } from "../design";

export const Mac = () => {
  const f = useCurrentFrame();
  const zoom = ramp(f, 140, 220);
  return (
    <Stage chapter="01 / DEMANDER">
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 255,
          width: 470,
          opacity: 1 - zoom,
        }}
      >
        <Reveal>
          <Eyebrow>Sur votre Mac</Eyebrow>
          <div
            style={{
              fontSize: 78,
              lineHeight: 1.14,
              fontWeight: 650,
              letterSpacing: -4,
            }}
          >
            Une vidéo.
            <br />
            Une vraie
            <br />
            <span style={{ color: C.mint }}>conversation.</span>
          </div>
        </Reveal>
        <Reveal delay={35}>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.5,
              color: C.muted,
              marginTop: 36,
            }}
          >
            Des réponses reliées
            <br />
            aux passages observés.
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          top: 162 - zoom * 12,
          left: 580 - zoom * 480,
          width: 1250 + zoom * 470,
          height: 792 + zoom * 48,
          transform: `translateY(${(1 - ramp(f, 5, 42)) * 95}px)`,
          opacity: ramp(f, 5, 35),
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          boxShadow: "0 35px 100px #0007",
          overflow: "hidden",
        }}
      >
        <Screen src="direct.png" />
      </div>
      <Footer>
        <span>Capture de l’app · réponses et délais réels conservés</span>
        <span>Spring · © Blender Foundation · CC BY 4.0</span>
      </Footer>
    </Stage>
  );
};
