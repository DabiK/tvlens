import { useCurrentFrame } from "remotion";
import { C, Stage, Reveal, Screen, Footer, ramp } from "../design";

export const Floating = () => {
  const f = useCurrentFrame();
  return (
    <Stage chapter="PRÉSENT QUAND IL FAUT">
      <Reveal style={{ position: "absolute", left: 100, top: 165 }}>
        <div style={{ fontSize: 82, fontWeight: 600, letterSpacing: -4 }}>
          Toute la place au programme.
        </div>
        <div style={{ fontSize: 31, color: C.muted, marginTop: 15 }}>
          Un compagnon qui sait se faire discret.
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 95,
          top: 370,
          width: 1090,
          height: 565,
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${C.line}`,
        }}
      >
        <Screen
          src="direct.png"
          style={{
            position: "absolute",
            width: 1880,
            maxWidth: "none",
            left: -30,
            top: -218,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 30,
            left: 90,
            width: 820,
            opacity: ramp(f, 20, 45),
            transform: `translateY(${(1 - ramp(f, 20, 55)) * 25}px)`,
          }}
        >
          <Screen src="floating-bar.png" radius={18} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1250,
          top: 340,
          width: 480,
          opacity: ramp(f, 90, 120),
          transform: `translateY(${(1 - ramp(f, 90, 130)) * 60}px)`,
        }}
      >
        <Screen src="floating-chat.png" radius={20} />
      </div>
      <Footer>
        <span>Mode flottant · captures de l’app mises en scène</span>
        <span>macOS</span>
      </Footer>
    </Stage>
  );
};
