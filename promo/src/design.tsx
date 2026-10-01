import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { loadFont } from "@remotion/fonts";

loadFont({
  family: "Manrope",
  url: staticFile("fonts/Manrope.ttf"),
  weight: "200 800",
});

export const C = {
  ink: "#081519",
  paper: "#eff3ed",
  mint: "#bee9cc",
  muted: "#94a7a7",
  line: "#294044",
};
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const ramp = (f: number, start: number, end: number) =>
  interpolate(f, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

export const Brand = ({ light = false }: { light?: boolean }) => (
  <div
    style={{
      fontSize: 32,
      fontWeight: 800,
      letterSpacing: -1.5,
      color: light ? C.ink : C.paper,
    }}
  >
    TV<span style={{ color: light ? "#427457" : C.mint }}>Lens</span>
    <span
      style={{
        fontSize: 15,
        fontWeight: 500,
        letterSpacing: 2,
        marginLeft: 22,
        opacity: 0.55,
      }}
    >
      LE CONTEXTE RESTE.
    </span>
  </div>
);

export const Stage = ({
  children,
  light = false,
  chapter,
}: {
  children: React.ReactNode;
  light?: boolean;
  chapter: string;
}) => (
  <AbsoluteFill
    style={{
      background: light ? C.paper : C.ink,
      color: light ? C.ink : C.paper,
      fontFamily: "Manrope",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 45,
        left: 72,
        right: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 9,
      }}
    >
      <Brand light={light} />
      <div style={{ fontSize: 17, letterSpacing: 2.5, opacity: 0.55 }}>
        {chapter}
      </div>
    </div>
    {children}
  </AbsoluteFill>
);

export const Reveal = ({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        opacity: ramp(f, delay, delay + 24),
        transform: `translateY(${(1 - ramp(f, delay, delay + 32)) * 44}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Eyebrow = ({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) => (
  <div
    style={{
      fontSize: 20,
      fontWeight: 650,
      letterSpacing: 4,
      textTransform: "uppercase",
      color: light ? "#467257" : C.mint,
      marginBottom: 26,
    }}
  >
    {children}
  </div>
);
export const Footer = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      position: "absolute",
      bottom: 35,
      left: 72,
      right: 72,
      fontSize: 19,
      color: C.muted,
      display: "flex",
      justifyContent: "space-between",
    }}
  >
    {children}
  </div>
);

export const Screen = ({
  src,
  style,
  radius = 14,
}: {
  src: string;
  style?: React.CSSProperties;
  radius?: number;
}) => (
  <CanvasImage
    src={staticFile(`screens/${src}`)}
    premountFor={30}
    style={{ width: "100%", height: "auto", borderRadius: radius, ...style }}
  />
);

export const Line = ({
  at = 0,
  width = 200,
}: {
  at?: number;
  width?: number;
}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        height: 3,
        width: width * ramp(f, at, at + 40),
        background: C.mint,
        marginTop: 32,
      }}
    />
  );
};
