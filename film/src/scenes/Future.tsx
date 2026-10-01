import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  C,
  clamp,
  enter,
  Eyebrow,
  font,
  Logo,
  mono,
  Reveal,
  Sidebar,
} from "../ui";
import { Footage } from "./Watching";
export const Future = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: "#e8ece5",
        color: "#15302d",
        fontFamily: font,
        padding: "100px 130px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            border: "1px solid #83968a",
            borderRadius: 30,
            padding: "14px 25px",
            fontFamily: mono,
            fontSize: 21,
            letterSpacing: 3,
          }}
        >
          NEXT EXPERIMENT
        </div>
        <div style={{ fontSize: 21, color: "#66796b" }}>RECHERCHE À VENIR</div>
      </div>
      <Reveal>
        <div
          style={{
            fontSize: 84,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -3.5,
            marginTop: 60,
          }}
        >
          Et si la compréhension
          <br />
          se rapprochait de toi ?
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 135,
          top: 455,
          width: 1650,
          display: "flex",
          alignItems: "center",
          gap: 45,
        }}
      >
        <div style={{ width: 240, display: "grid", gap: 18 }}>
          <div
            style={{
              border: "1px solid #9bad9e",
              borderRadius: 14,
              padding: 24,
              fontSize: 30,
            }}
          >
            ▣ Image
          </div>
          <div
            style={{
              border: "1px solid #9bad9e",
              borderRadius: 14,
              padding: 24,
              fontSize: 30,
            }}
          >
            ≋ Audio
          </div>
        </div>
        <div
          style={{
            height: 2,
            width: 140,
            background: "#8ba08c",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#3f6348",
              position: "absolute",
              top: -6,
              left: interpolate(f, [25, 65], [0, 125], clamp),
            }}
          />
        </div>
        <div
          style={{
            width: 590,
            border: "1px solid #6f8878",
            borderRadius: 23,
            padding: "38px 40px",
            background: "#f3f5ee",
            boxShadow: "0 20px 40px #11281d0a",
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 22,
              color: "#62785e",
              marginBottom: 18,
            }}
          >
            ASUS GX10
          </div>
          <div style={{ fontSize: 47, fontWeight: 600, letterSpacing: -1.5 }}>
            Local understanding
          </div>
          <div style={{ fontSize: 23, marginTop: 18, color: "#607466" }}>
            Image + audio → contexte vidéo
          </div>
        </div>
        <div style={{ height: 2, width: 130, background: "#8ba08c" }} />
        <div style={{ color: "#102b28" }}>
          <div style={{ fontSize: 55, fontWeight: 800, letterSpacing: -3 }}>
            TVLens
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 135,
          left: 135,
          right: 135,
          display: "flex",
          justifyContent: "space-between",
          gap: 40,
          borderTop: "1px solid #b6c4b4",
          paddingTop: 32,
        }}
      >
        {[
          "Confidentialité · à évaluer",
          "Latence ?",
          "Architecture modèle ?",
        ].map((s, i) => (
          <div
            key={s}
            style={{
              fontSize: 26,
              color: "#51694f",
              opacity: enter(f, 55 + i * 10),
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
export const EndCard = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 30], [0.36, 0.1], clamp);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: font, color: C.text }}>
      <div style={{ position: "absolute", inset: 0, opacity: fade }}>
        <div style={{ position: "absolute", inset: 0, right: 650 }}>
          <Footage start={119} />
        </div>
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 650,
          }}
        >
          <Sidebar stage={3} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(0deg,#07191f,transparent)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          scale: interpolate(f, [0, 100], [0.97, 1], clamp),
        }}
      >
        <Reveal>
          <Logo size={170} />
        </Reveal>
        <Reveal delay={12}>
          <div
            style={{
              fontSize: 46,
              letterSpacing: -1,
              marginTop: 17,
              color: C.mint,
            }}
          >
            Ask what you’re watching.
          </div>
        </Reveal>
        <Reveal delay={25}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 30,
              marginTop: 65,
              fontSize: 24,
              color: C.muted,
            }}
          >
            <span>Ta question</span>
            <span style={{ color: C.line }}>→</span>
            <span>Le contexte</span>
            <span style={{ color: C.line }}>→</span>
            <span style={{ color: C.lime }}>Les preuves</span>
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 75,
          left: 130,
          right: 130,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 19,
          color: C.muted,
        }}
      >
        <span>LG TV · YouTube · Mac</span>
        <span>Interface recréée · séquence de démonstration</span>
      </div>
    </AbsoluteFill>
  );
};
