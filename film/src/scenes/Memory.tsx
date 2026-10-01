import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  C,
  clamp,
  enter,
  Eyebrow,
  font,
  Logo,
  mono,
  Pill,
  Reveal,
} from "../ui";
import { Footage } from "./Watching";
export const FollowUp = () => {
  const f = useCurrentFrame();
  const text = "Et ce qu’il disait avant ?".slice(
    0,
    Math.floor(Math.max(0, f - 15) / 1.5),
  );
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.text, fontFamily: font }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.36 }}>
        <Footage start={90} />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg,#07191fd9,transparent)",
        }}
      />
      <div style={{ position: "absolute", left: 130, top: 155 }}>
        <Eyebrow>LA VIDÉO AVANCE.</Eyebrow>
        <div
          style={{
            fontSize: 84,
            fontWeight: 600,
            letterSpacing: -3,
            lineHeight: 1.08,
            marginTop: 25,
          }}
        >
          Le contexte
          <br />
          <span style={{ color: C.mint }}>reste.</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 640, right: 140, top: 490 }}>
        <Reveal delay={12}>
          <div
            style={{
              padding: "32px 38px",
              border: `1px solid ${C.line}`,
              background: C.panel,
              borderRadius: 24,
              boxShadow: "0 22px 80px #0006",
            }}
          >
            <div style={{ fontSize: 48, letterSpacing: -1.3 }}>
              {text}
              <span style={{ color: C.lime, opacity: f < 60 ? 1 : 0 }}>|</span>
            </div>
            <div
              style={{
                marginTop: 24,
                display: "flex",
                alignItems: "center",
                gap: 15,
                color: C.mint,
                fontSize: 23,
                opacity: enter(f, 55),
              }}
            >
              <span>↶</span>
              <span>Recherche dans les passages précédents</span>
              <span style={{ fontFamily: mono, marginLeft: "auto" }}>
                1:08:05
              </span>
            </div>
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 110,
          left: 130,
          display: "flex",
          gap: 15,
          opacity: enter(f, 100),
        }}
      >
        <Pill>Direct</Pill>
        <Pill active>↶ Mémoire</Pill>
      </div>
    </AbsoluteFill>
  );
};
const moments = [
  {
    time: "1:07:38",
    title: "La crise économique",
    description: "Le coût de la pandémie",
    image: "moment-0.jpg",
  },
  {
    time: "1:08:05",
    title: "Les aides aux entreprises",
    description: "Fonds de solidarité, activité partielle",
    image: "moment-1.jpg",
  },
  {
    time: "1:08:32",
    title: "Le chiffre du chômage",
    description: "De 9,6 à 7,4 %",
    image: "moment-2.jpg",
  },
  {
    time: "1:09:05",
    title: "La suite du débat",
    description: "Échange entre les candidats",
    image: "moment-3.jpg",
  },
];
export const Memory = () => {
  const f = useCurrentFrame();
  const move = interpolate(f, [15, 65], [0, 400], clamp);
  const selected = f > 48 ? 1 : 2;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: font, color: C.text }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 470,
          opacity: 0.4,
        }}
      >
        <Sequence durationInFrames={75} premountFor={30}>
          <Footage start={97} />
        </Sequence>
        <Sequence from={75} premountFor={30}>
          <Footage start={35.5} />
        </Sequence>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(0deg,#07191f,transparent)",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <Eyebrow>TVLENS / MÉMOIRE</Eyebrow>
          <div
            style={{
              fontSize: 59,
              fontWeight: 600,
              letterSpacing: -2,
              marginTop: 19,
            }}
          >
            Le fil du visionnage.
          </div>
        </div>
        <Pill>Retour au direct ↗</Pill>
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 250,
          color: C.mint,
          fontSize: 29,
        }}
      >
        Images <span style={{ color: C.line, padding: 22 }}>·</span> Paroles{" "}
        <span style={{ color: C.line, padding: 22 }}>·</span> Événements{" "}
        <span style={{ color: C.line, padding: 22 }}>·</span> Résumés
      </div>
      <div
        style={{
          position: "absolute",
          top: 370,
          left: -120 + move,
          display: "flex",
          gap: 26,
        }}
      >
        {moments.map((m, i) => (
          <div key={m.time} style={{ width: 440, position: "relative" }}>
            <div
              style={{
                height: 2,
                background: C.line,
                position: "absolute",
                left: 0,
                right: -28,
                top: 14,
              }}
            />
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: selected === i ? C.lime : C.muted,
                position: "relative",
                marginBottom: 25,
                marginTop: 8,
                boxShadow: selected === i ? "0 0 0 7px #d1f58c18" : "none",
              }}
            />
            <div
              style={{
                fontFamily: mono,
                fontSize: 21,
                color: selected === i ? C.lime : C.muted,
                marginBottom: 18,
              }}
            >
              {m.time}
            </div>
            <div
              style={{
                background: selected === i ? "#1a3331" : C.panel,
                border: `${selected === i ? 3 : 1}px solid ${selected === i ? C.mint : C.line}`,
                borderRadius: 18,
                padding: 13,
                height: 300,
              }}
            >
              <Img
                src={staticFile(m.image)}
                style={{
                  width: "100%",
                  height: 180,
                  objectFit: "cover",
                  borderRadius: 9,
                  opacity: selected === i ? 1 : 0.58,
                }}
              />
              <div
                style={{
                  fontSize: 27,
                  fontWeight: 550,
                  margin: "15px 7px 8px",
                }}
              >
                {m.title}
              </div>
              <div style={{ fontSize: 19, color: C.muted, marginLeft: 7 }}>
                {m.description}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Reveal
        delay={76}
        style={{ position: "absolute", bottom: 90, left: 100, right: 100 }}
      >
        <div
          style={{
            display: "flex",
            gap: 44,
            padding: "28px 35px",
            background: C.panel,
            borderRadius: 17,
            border: `1px solid ${C.line}`,
          }}
        >
          <div
            style={{
              color: C.mint,
              fontFamily: mono,
              fontSize: 24,
              paddingTop: 4,
            }}
          >
            1:08:05 ↗
          </div>
          <div>
            <div
              style={{
                color: C.mint,
                fontSize: 18,
                letterSpacing: 2,
                marginBottom: 10,
              }}
            >
              CONTEXTE PRÉCÉDENT RETROUVÉ
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.35 }}>
              Il évoquait les aides aux entreprises pendant la crise Covid,
              <br />
              avant de présenter le bilan du chômage.
            </div>
          </div>
          <div style={{ marginLeft: "auto", alignSelf: "center" }}>
            <Logo size={31} />
          </div>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
