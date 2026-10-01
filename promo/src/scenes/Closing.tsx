import { C, Stage, Reveal } from "../design";

export const Closing = () => (
  <Stage chapter="ASUS ASCENT GX10 · DEVELOPER CHALLENGE">
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Reveal>
        <div style={{ fontSize: 172, letterSpacing: -11, fontWeight: 800 }}>
          TV<span style={{ color: C.mint }}>Lens</span>
        </div>
      </Reveal>
      <Reveal delay={16}>
        <div style={{ fontSize: 40, letterSpacing: -1, marginTop: 20 }}>
          Ne faites plus que regarder.
        </div>
      </Reveal>
      <Reveal delay={40}>
        <div
          style={{
            fontSize: 28,
            marginTop: 70,
            paddingBottom: 12,
            borderBottom: `1px solid ${C.mint}`,
          }}
        >
          github.com/DabiK/tvlens{" "}
          <span style={{ color: C.mint, paddingLeft: 25 }}>↗</span>
        </div>
      </Reveal>
    </div>
    <div
      style={{
        position: "absolute",
        bottom: 42,
        left: 72,
        color: C.muted,
        fontSize: 16,
      }}
    >
      Captures Mac : Spring — © Blender Foundation · CC BY 4.0 ·
      cloud.blender.org/spring
    </div>
  </Stage>
);
