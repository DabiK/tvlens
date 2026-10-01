import {
  AbsoluteFill,
  Series,
  useCurrentFrame,
  interpolate,
  staticFile,
} from "remotion";
import { Audio } from "@remotion/media";
import { Opening } from "./scenes/Opening";
import { Question } from "./scenes/Question";
import { Mac } from "./scenes/Mac";
import { Floating } from "./scenes/Floating";
import { Television } from "./scenes/Television";
import { Evidence } from "./scenes/Evidence";
import { Local } from "./scenes/Local";
import { Closing } from "./scenes/Closing";

export const Film = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#081519" }}>
      <Series>
        <Series.Sequence
          name="La vidéo continue"
          durationInFrames={180}
          premountFor={30}
        >
          <Opening />
        </Series.Sequence>
        <Series.Sequence
          name="Une question suffit"
          durationInFrames={180}
          premountFor={30}
        >
          <Question />
        </Series.Sequence>
        <Series.Sequence
          name="Mac — demander"
          durationInFrames={300}
          premountFor={30}
        >
          <Mac />
        </Series.Sequence>
        <Series.Sequence
          name="Mode flottant"
          durationInFrames={240}
          premountFor={30}
        >
          <Floating />
        </Series.Sequence>
        <Series.Sequence
          name="LG — retrouver"
          durationInFrames={300}
          premountFor={30}
        >
          <Television />
        </Series.Sequence>
        <Series.Sequence
          name="Explorer les preuves"
          durationInFrames={240}
          premountFor={30}
        >
          <Evidence />
        </Series.Sequence>
        <Series.Sequence
          name="Ambition GX10"
          durationInFrames={300}
          premountFor={30}
        >
          <Local />
        </Series.Sequence>
        <Series.Sequence name="TVLens" durationInFrames={180} premountFor={30}>
          <Closing />
        </Series.Sequence>
      </Series>
      <Audio
        src={staticFile("tvlens-score.wav")}
        premountFor={30}
        volume={0.85}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: "#081519",
          opacity: interpolate(f, [0, 15, 1900, 1919], [1, 0, 0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
};
