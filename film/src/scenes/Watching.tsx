import {
  AbsoluteFill,
  Freeze,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Video } from "@remotion/media";
import { C, clamp, enter, font, mono, Sidebar, Mic } from "../ui";
import { content } from "../content";
export const Footage = ({
  start = 62.15,
  volume = 0,
}: {
  start?: number;
  volume?: number;
}) => (
  <Video
    src={staticFile(content.video)}
    trimBefore={Math.round(start * 30)}
    muted={volume === 0}
    volume={volume}
    premountFor={30}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
  />
);
const Remote = () => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        bottom: -35,
        right: 660,
        width: 130,
        height: 400,
        borderRadius: 65,
        background: "linear-gradient(100deg,#282d30,#0e1113 60%,#262c2f)",
        border: "2px solid #566064",
        boxShadow: "0 30px 70px #000a",
        rotate: "-14deg",
        translate: `0 ${150 * (1 - enter(f, 100))}px`,
        opacity: interpolate(f, [100, 111, 150, 165], [0, 1, 1, 0], clamp),
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          background: "#f07c72",
          borderRadius: "50%",
          margin: "30px auto",
        }}
      />
      <div
        style={{
          width: 88,
          height: 88,
          border: "1px solid #5c696d",
          borderRadius: "50%",
          margin: "40px auto",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: f > 115 ? C.mint : "#343c40",
            color: C.bg,
            display: "grid",
            placeItems: "center",
            fontSize: 17,
          }}
        >
          OK
        </div>
      </div>
      <div
        style={{
          margin: "auto",
          width: 62,
          height: 42,
          borderRadius: 20,
          background: "#253139",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Mic size={22} />
      </div>
    </div>
  );
};
export const Watching = () => {
  const f = useCurrentFrame();
  const open = enter(f, 96);
  const ask = f >= 210;
  const typed = "C’est vrai ce qu’il vient de dire ?".slice(
    0,
    Math.max(0, Math.floor((f - 222) / 1.6)),
  );
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: font, color: C.text }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          scale:
            1 + interpolate(f, [30, 48, 82, 112], [0, 0.045, 0.045, 0], clamp),
          transformOrigin: "50% 70%",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            right: 600 * open,
            overflow: "hidden",
          }}
        >
          <Sequence from={0} durationInFrames={66} premountFor={30}>
            <Footage volume={1} />
          </Sequence>
          <Sequence from={66} durationInFrames={8} premountFor={30}>
            <Freeze frame={66}>
              <Footage />
            </Freeze>
          </Sequence>
          <Sequence from={74} premountFor={30}>
            <Footage start={64.35} volume={0} />
          </Sequence>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(0deg,#030b12e8,transparent 58%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 70,
              top: 60,
              fontSize: 19,
              letterSpacing: 2,
              color: "#fff9",
            }}
          >
            LE DÉBAT · 20 AVRIL 2022
          </div>
          {f < 90 && (
            <div
              style={{
                position: "absolute",
                left: 100,
                right: 100,
                bottom: 150,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 46, marginBottom: 20 }}>
                « …passé de 9,6 à{" "}
                <span
                  style={{
                    background: f > 45 ? C.lime : "transparent",
                    color: f > 45 ? C.bg : "white",
                    padding: "3px 14px",
                    borderRadius: 8,
                  }}
                >
                  7,4 %
                </span>{" "}
                »
              </div>
              <div
                style={{
                  fontSize: 69,
                  fontWeight: 650,
                  letterSpacing: -2,
                  lineHeight: 1.08,
                  opacity: interpolate(f, [42, 53], [0, 1], clamp),
                }}
              >
                Il vient de balancer un chiffre.
                <br />
                <span style={{ color: C.lime }}>Tu le crois ?</span>
              </div>
            </div>
          )}
          {f >= 90 && (
            <div
              style={{ position: "absolute", left: 65, bottom: 90, right: 40 }}
            >
              <div style={{ fontSize: 22, color: C.muted, marginBottom: 20 }}>
                ▶ YouTube{" "}
                <span style={{ fontFamily: mono, marginLeft: 25 }}>
                  1:08:{String(32 + Math.floor((f - 8) / 30)).padStart(2, "0")}
                </span>
              </div>
              <div
                style={{
                  fontSize: 51,
                  fontWeight: 600,
                  letterSpacing: -1.5,
                  lineHeight: 1.15,
                  maxWidth: 790,
                }}
              >
                {ask ? "Pas besoin de répéter." : "Tu veux vérifier ?"}
                <br />
                <span style={{ color: C.mint }}>
                  {ask ? "Pose juste ta question." : "Demande simplement."}
                </span>
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 600,
            translate: `${600 * (1 - open)}px 0`,
          }}
        >
          <Sidebar stage={0} question={ask ? typed : ""} />
        </div>
      </div>
      <Remote />
      {ask && (
        <div
          style={{
            position: "absolute",
            left: 730,
            top: 430,
            width: 990,
            padding: 35,
            border: `1px solid ${C.line}`,
            borderRadius: 22,
            background: "#112a32f5",
            boxShadow: "0 25px 90px #0009",
            opacity: enter(f, 220),
            translate: `0 ${30 * (1 - enter(f, 220))}px`,
          }}
        >
          <div
            style={{
              color: C.mint,
              fontFamily: mono,
              fontSize: 18,
              marginBottom: 16,
            }}
          >
            TA QUESTION
          </div>
          <div
            style={{
              display: "flex",
              gap: 25,
              alignItems: "center",
              fontSize: 47,
              letterSpacing: -1.2,
            }}
          >
            <Mic size={38} />
            <span>
              {typed}
              <span style={{ opacity: Math.floor(f / 12) % 2 }}>|</span>
            </span>
          </div>
          <div
            style={{
              marginTop: 23,
              fontSize: 20,
              color: C.mint,
              opacity: enter(f, 285),
            }}
          >
            ✓ Passage correspondant retrouvé · {content.timestamp}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
