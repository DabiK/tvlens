import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, enter, Eyebrow, font, Logo, Pill, Sidebar } from "../ui";
import { Footage } from "./Watching";
const DeviceContent = ({
  mac = false,
  stage = 3,
}: {
  mac?: boolean;
  stage?: number;
}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: C.bg,
      overflow: "hidden",
    }}
  >
    {mac && (
      <div
        style={{
          height: 85,
          padding: "0 34px",
          display: "flex",
          alignItems: "center",
          borderBottom: `1px solid ${C.line}`,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 9, marginRight: 20 }}>
          {["#ef847a", "#e7c279", "#a5c986"].map((c) => (
            <div
              key={c}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: c,
              }}
            />
          ))}
        </div>
        <Logo size={32} />
        <div style={{ display: "flex", gap: 12, margin: "auto" }}>
          <Pill active>Direct</Pill>
          <Pill>◷ Mémoire</Pill>
        </div>
      </div>
    )}
    <div
      style={{
        position: "absolute",
        top: mac ? 85 : 0,
        left: 0,
        bottom: 0,
        right: 635,
      }}
    >
      <Footage start={104} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(0deg,#07191f,transparent 55%)",
        }}
      />
      <div style={{ position: "absolute", bottom: 60, left: 50 }}>
        <div style={{ fontSize: 21, color: C.muted, marginBottom: 18 }}>
          ▶ YouTube · Le débat · 20 avril 2022
        </div>
        <div style={{ fontSize: 36, fontWeight: 600 }}>
          Tu regardes. Tu demandes.
        </div>
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        top: mac ? 85 : 0,
        right: 0,
        bottom: 0,
        width: 635,
      }}
    >
      <div
        style={{
          width: "111.111%",
          height: "111.111%",
          scale: 0.9,
          transformOrigin: "0 0",
        }}
      >
        <Sidebar stage={stage} />
      </div>
    </div>
  </div>
);
export const Platforms = () => {
  const f = useCurrentFrame();
  const mac = f >= 150;
  const cut = enter(f, 150);
  const zoom = interpolate(
    f,
    [0, 25, 130, 150, 173, 270],
    [0.96, 1, 1, 0.99, 1, 1.015],
    clamp,
  );
  return (
    <AbsoluteFill
      style={{ background: "#0a0e10", color: C.text, fontFamily: font }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 70%,#263f4144,transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 62,
          left: 100,
          right: 100,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Eyebrow>
            {mac ? "LA MÊME CONVERSATION" : "SUR LE GRAND ÉCRAN"}
          </Eyebrow>
          <div
            style={{
              fontSize: 61,
              fontWeight: 600,
              letterSpacing: -2,
              marginTop: 15,
            }}
          >
            {mac ? "Et sur Mac." : "Directement sur la télévision."}
          </div>
        </div>
        <Pill>{mac ? "TVLens for Mac" : "LG TV + YouTube"}</Pill>
      </div>
      <div
        style={{
          position: "absolute",
          left: 165,
          top: 244,
          width: 1590,
          height: 738,
          scale: zoom,
          transformOrigin: "50% 50%",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: mac ? 25 : 14,
            border: "12px solid #262e31",
            background: "#000",
            boxShadow: "0 30px 100px #000a",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 1920,
              height: 900,
              scale: 1566 / 1920,
              transformOrigin: "0 0",
            }}
          >
            <DeviceContent
              mac={mac}
              stage={
                f >= 45 && f < 65
                  ? 0
                  : f >= 65 && f < 85
                    ? 1
                    : f >= 85 && f < 100
                      ? 2
                      : 3
              }
            />
          </div>
        </div>
        {!mac && (
          <>
            <div
              style={{
                position: "absolute",
                width: 190,
                height: 45,
                background: "linear-gradient(#41494b,#151c1f)",
                bottom: -43,
                left: 700,
                clipPath: "polygon(35% 0,65% 0,100% 100%,0 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: 420,
                height: 9,
                background: "#394247",
                bottom: -50,
                left: 585,
                borderRadius: "50%",
              }}
            />
          </>
        )}
        {mac && (
          <div
            style={{
              position: "absolute",
              bottom: -25,
              left: -55,
              width: 1700,
              height: 35,
              background: "linear-gradient(#a3adaf,#535e62)",
              borderRadius: "3px 3px 45px 45px",
              opacity: cut,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
