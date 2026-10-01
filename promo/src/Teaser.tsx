import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  staticFile,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { C, Screen, ramp } from "./design";

// A deliberately separate cut: V1 remains editable as TVLens.
const Shell = ({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) => (
  <AbsoluteFill
    style={{
      background: light ? C.paper : C.ink,
      color: light ? C.ink : C.paper,
      fontFamily: "Manrope",
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

const Words = ({
  children,
  size = 132,
  style = {},
}: {
  children: string;
  size?: number;
  style?: React.CSSProperties;
}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 800,
        letterSpacing: -size * 0.052,
        lineHeight: 1.04,
        ...style,
      }}
    >
      {children.split(" ").map((word, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            marginRight: ".22em",
            overflow: "hidden",
            verticalAlign: "top",
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: `translateY(${(1 - ramp(f, i * 3, i * 3 + 10)) * 110}%)`,
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </div>
  );
};

const Stamp = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      position: "absolute",
      left: 65,
      bottom: 30,
      fontSize: 17,
      color: "#c5d5ce",
      background: "#081519d9",
      padding: "5px 12px",
      borderRadius: 5,
    }}
  >
    {children}
  </div>
);

const OpeningProduct = () => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 920,
        top: 285,
        width: 940,
        transform: `translateY(${-ramp(f, 0, 110) * 20}px)`,
        boxShadow: "0 25px 80px #0006",
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      <Screen src="lg-chat.png" />
    </div>
  );
};

const Hook = () => (
  <Shell>
    <div
      style={{
        position: "absolute",
        left: 90,
        top: 85,
        fontSize: 32,
        color: C.mint,
        fontWeight: 700,
      }}
    >
      TVLens / Vérifie ce qui se dit à la télé.
    </div>
    <div
      style={{
        position: "absolute",
        left: 90,
        top: 280,
        width: 780,
        fontSize: 104,
        fontWeight: 800,
        lineHeight: 1.12,
        letterSpacing: -5,
      }}
    >
      Un débat.
      <br />
      Un chiffre.
      <br />
      <span style={{ color: C.mint }}>Tu veux vérifier.</span>
    </div>
    <OpeningProduct />
    <Stamp>Aperçu du companion LG · montage promotionnel</Stamp>
  </Shell>
);

const Ask = () => {
  const f = useCurrentFrame();
  return (
    <Shell>
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 85,
          fontSize: 32,
          color: C.mint,
          fontWeight: 700,
        }}
      >
        PENDANT QUE TU REGARDES
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 260,
          width: 780,
          fontSize: 100,
          fontWeight: 800,
          lineHeight: 1.12,
          letterSpacing: -5,
        }}
      >
        TVLens regarde
        <br />
        et écoute
        <br />
        avec toi.
      </div>
      <div
        style={{
          position: "absolute",
          left: 95,
          top: 720,
          width: 760,
          fontSize: 42,
          lineHeight: 1.3,
          color: C.mint,
          opacity: ramp(f, 8, 18),
        }}
      >
        Et cherche les sources
        <br />
        pour vérifier.
      </div>
      <OpeningProduct />
      <Stamp>
        Image + son → contexte → recherche de sources · montage promotionnel
      </Stamp>
    </Shell>
  );
};

const EvidenceBeat = ({
  eyebrow,
  title,
  detail,
  light = false,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  light?: boolean;
}) => {
  const f = useCurrentFrame();
  return (
    <Shell light={light}>
      <div
        style={{
          position: "absolute",
          right: 90,
          top: 30,
          fontSize: 430,
          fontWeight: 800,
          color: light ? "#d9e5dd" : "#18382e",
          transform: `translateX(${(1 - ramp(f, 0, 16)) * 400}px)`,
        }}
      >
        ↗
      </div>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 130,
          fontSize: 30,
          color: light ? "#48725a" : C.mint,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ position: "absolute", left: 110, top: 350, width: 1660 }}>
        <Words size={142}>{title}</Words>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 790,
          fontSize: 38,
          opacity: ramp(f, 15, 23),
        }}
      >
        {detail}
      </div>
      <Stamp>Parcours illustré · aucun résultat d’enquête simulé</Stamp>
    </Shell>
  );
};
const Answer = () => (
  <EvidenceBeat
    light
    eyebrow="02 / LA VÉRIFICATION"
    title="Cherche les preuves."
    detail="Articles. Données. Sources externes."
  />
);

const Rewind = () => {
  const f = useCurrentFrame();
  return (
    <Shell light>
      <div style={{ position: "absolute", left: 100, top: 150 }}>
        <Words size={108}>Reviens à ce qui a été dit.</Words>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 450,
          height: 390,
          display: "flex",
          gap: 32,
          transform: `translateX(${-450 + ramp(f, 0, 43) * 550}px)`,
        }}
      >
        {["lg-timeline.png", "memory.png", "direct.png", "lg-chat.png"].map(
          (src, i) => (
            <div
              key={src}
              style={{
                flex: "0 0 600px",
                height: 380,
                overflow: "hidden",
                borderRadius: 20,
                transform: `rotate(${i % 2 ? -3 : 3}deg)`,
                boxShadow: "0 20px 40px #08151918",
              }}
            >
              <Screen src={src} />
            </div>
          ),
        )}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 95,
          left: 100,
          right: 100,
          height: 3,
          background: "#c4d3c8",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${80 - ramp(f, 0, 45) * 60}%`,
            top: -17,
            background: C.ink,
            color: C.mint,
            padding: "8px 24px",
            fontSize: 24,
            borderRadius: 30,
          }}
        >
          −02:00 ↶
        </div>
      </div>
    </Shell>
  );
};

const Memory = () => (
  <EvidenceBeat
    light
    eyebrow="03 / LES SOURCES"
    title="Fais-toi ton avis."
    detail="Ce qui est dit ≠ ce qui est établi."
  />
);

const Doubt = () => {
  const f = useCurrentFrame();
  return (
    <Shell light>
      <div
        style={{
          position: "absolute",
          left: 145,
          top: 260,
          width: 1600,
          transform: `scale(${1 + ramp(f, 0, 48) * 0.045})`,
          transformOrigin: "left center",
        }}
      >
        <Words size={157}>Le débat continue.</Words>
        <div style={{ fontSize: 36, marginTop: 60, opacity: ramp(f, 20, 30) }}>
          Tu vérifies pendant que tu regardes.
        </div>
      </div>
    </Shell>
  );
};

const Proof = () => {
  const f = useCurrentFrame();
  return (
    <Shell>
      <div style={{ position: "absolute", left: 110, top: 200, width: 1650 }}>
        <Words size={132}>Garde ton esprit critique.</Words>
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 670,
          display: "flex",
          alignItems: "center",
          gap: 48,
          fontSize: 41,
        }}
      >
        {["Le passage", "↗", "La recherche", "↗", "Les sources"].map((t, i) => (
          <span
            key={i}
            style={{
              opacity: ramp(f, 10 + i * 5, 18 + i * 5),
              color: i % 2 ? C.mint : C.paper,
              transform: `translateX(${(1 - ramp(f, 10 + i * 5, 18 + i * 5)) * -35}px)`,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 130,
          fontSize: 22,
          color: C.muted,
        }}
      >
        Une observation n’est pas une preuve.
      </div>
    </Shell>
  );
};

const OnMac = () => {
  const f = useCurrentFrame();
  return (
    <Shell light>
      <div style={{ position: "absolute", left: 105, top: 95, zIndex: 2 }}>
        <Words size={140}>Sur ton Mac.</Words>
      </div>
      <div
        style={{
          position: "absolute",
          left: 520 - ramp(f, 0, 25) * 100,
          top: 270,
          width: 1400,
          transform: `rotate(${4 - ramp(f, 0, 28) * 4}deg)`,
        }}
      >
        <Screen src="direct.png" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 660,
          fontSize: 120,
          color: "#547f63",
        }}
      >
        ↗
      </div>
    </Shell>
  );
};

const OnTV = ({ timeline = false }: { timeline?: boolean }) => {
  const f = useCurrentFrame();
  return (
    <Shell>
      <div style={{ position: "absolute", left: 95, top: 70, zIndex: 2 }}>
        <Words size={122}>{timeline ? "Remonte le fil." : "Sur ta TV."}</Words>
      </div>
      <div
        style={{
          position: "absolute",
          left: 230,
          top: 255,
          width: 1460,
          transform: `scale(${0.94 + ramp(f, 0, 18) * 0.06})`,
        }}
      >
        <Screen src={timeline ? "lg-timeline.png" : "lg-chat.png"} />
      </div>
      <Stamp>Aperçus LG · YouTube · TV rootée de test</Stamp>
    </Shell>
  );
};

const Discreet = () => {
  const f = useCurrentFrame();
  return (
    <Shell>
      <Video
        objectFit="cover"
        src={staticFile("spring-teaser.mp4")}
        trimBefore={180}
        muted
        premountFor={30}
        style={{ width: "100%", height: "100%" }}
      />
      <AbsoluteFill
        style={{ background: "linear-gradient(#08151999,transparent 65%)" }}
      />
      <div style={{ position: "absolute", top: 100, left: 100 }}>
        <Words size={124}>Et pour tes films aussi.</Words>
      </div>
      <div
        style={{
          position: "absolute",
          width: 910,
          left: 505,
          bottom: 140,
          transform: `translateY(${(1 - ramp(f, 0, 17)) * 160}px)`,
        }}
      >
        <Screen src="floating-bar.png" />
      </div>
      <Stamp>
        Mode flottant mis en scène · Spring © Blender Foundation · CC BY 4.0
      </Stamp>
    </Shell>
  );
};

const GX10 = () => {
  const f = useCurrentFrame();
  return (
    <Shell>
      <div
        style={{
          position: "absolute",
          left: 1080,
          top: 170,
          width: 1450,
          opacity: 0.28,
          transform: `translateX(${-ramp(f, 0, 140) * 70}px) rotate(-4deg)`,
        }}
      >
        <Screen src="lg-chat.png" />
      </div>
      <AbsoluteFill
        style={{ background: "linear-gradient(90deg,#081519 35%,#08151920)" }}
      />
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 125,
          fontSize: 32,
          color: C.mint,
        }}
      >
        CE QU’ON VEUT TESTER
      </div>
      <div style={{ position: "absolute", left: 110, top: 255, width: 1450 }}>
        <Words size={110}>La suite, sur ASUS GX10.</Words>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 490,
          fontSize: 48,
          lineHeight: 1.8,
        }}
      >
        {[
          "Garder l’image et le son chez toi.",
          "Te répondre plus vite.",
          "Explorer d’autres architectures.",
        ].map((text, i) => (
          <div
            key={text}
            style={{
              opacity: ramp(f, 15 + i * 25, 27 + i * 25),
              transform: `translateY(${(1 - ramp(f, 15 + i * 25, 27 + i * 25)) * 22}px)`,
            }}
          >
            {text}
          </div>
        ))}
      </div>
      <Stamp>
        Objectifs à valider sur ASUS Ascent GX10 · recherche de sources sur
        Internet
      </Stamp>
    </Shell>
  );
};

const End = () => {
  const f = useCurrentFrame();
  return (
    <Shell>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 220,
            fontWeight: 800,
            letterSpacing: -13,
            transform: `scale(${0.75 + ramp(f, 0, 15) * 0.25})`,
          }}
        >
          TV<span style={{ color: C.mint }}>Lens</span>
        </div>
        <div style={{ fontSize: 46, marginTop: 20, opacity: ramp(f, 10, 20) }}>
          Regarde le débat. Vérifie ce qui se dit.
        </div>
        <div
          style={{
            fontSize: 29,
            marginTop: 70,
            opacity: ramp(f, 20, 30),
            color: C.mint,
          }}
        >
          github.com/DabiK/tvlens ↗
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 65,
          right: 65,
          bottom: 30,
          fontSize: 17,
          color: C.muted,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          Spring · © Blender Foundation · CC BY 4.0 · cloud.blender.org/spring
        </span>
        <span>POC Mac + LG · objectif GX10 : inférence locale</span>
      </div>
    </Shell>
  );
};

export const Teaser = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Sequence
        durationInFrames={60}
        name="Un chiffre te fait tiquer"
        premountFor={30}
      >
        <Hook />
      </Sequence>
      <Sequence
        from={60}
        durationInFrames={120}
        name="TVLens regarde et écoute avec toi"
        premountFor={30}
      >
        <Ask />
      </Sequence>
      <Sequence
        from={180}
        durationInFrames={60}
        name="Chercher les preuves"
        premountFor={30}
      >
        <Answer />
      </Sequence>
      <Sequence
        from={240}
        durationInFrames={60}
        name="Retrouve"
        premountFor={30}
      >
        <Rewind />
      </Sequence>
      <Sequence
        from={300}
        durationInFrames={60}
        name="Mémoire"
        premountFor={30}
      >
        <Memory />
      </Sequence>
      <Sequence
        from={360}
        durationInFrames={60}
        name="Est-ce vrai"
        premountFor={30}
      >
        <Doubt />
      </Sequence>
      <Sequence
        from={420}
        durationInFrames={60}
        name="Preuves"
        premountFor={30}
      >
        <Proof />
      </Sequence>
      <Sequence from={480} durationInFrames={60} name="Mac" premountFor={30}>
        <OnMac />
      </Sequence>
      <Sequence from={540} durationInFrames={60} name="TV" premountFor={30}>
        <OnTV />
      </Sequence>
      <Sequence from={600} durationInFrames={60} name="Frise" premountFor={30}>
        <OnTV timeline />
      </Sequence>
      <Sequence
        from={660}
        durationInFrames={60}
        name="Le film continue"
        premountFor={30}
      >
        <Discreet />
      </Sequence>
      <Sequence
        from={720}
        durationInFrames={180}
        name="La suite sur ASUS"
        premountFor={30}
      >
        <GX10 />
      </Sequence>
      <Sequence
        from={900}
        durationInFrames={120}
        name="Signature"
        premountFor={30}
      >
        <End />
      </Sequence>
      <Audio src={staticFile("teaser-score-34s.wav")} premountFor={30} />
      <AbsoluteFill
        style={{
          background: C.ink,
          pointerEvents: "none",
          opacity: interpolate(f, [1008, 1019], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
};
