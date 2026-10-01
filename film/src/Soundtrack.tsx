import { voiceoverReady } from "./voiceover-state";
import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
export const Soundtrack = ({ voice = true }: { voice?: boolean }) => (
  <>
    <Audio
      src={staticFile("audio/music-bed.wav")}
      volume={1}
      premountFor={30}
    />
    <Audio
      src={staticFile("audio/sound-design.wav")}
      volume={0.45}
      premountFor={30}
    />
    {voice && voiceoverReady && (
      <>
        <Sequence
          name="VO · Demande"
          from={98}
          durationInFrames={102}
          premountFor={30}
        >
          <Audio src={staticFile("audio/ask.wav")} />
        </Sequence>
        <Sequence
          name="VO · Contexte"
          from={338}
          durationInFrames={126}
          premountFor={30}
        >
          <Audio src={staticFile("audio/context.wav")} />
        </Sequence>
        <Sequence
          name="VO · Preuves"
          from={486}
          durationInFrames={225}
          premountFor={30}
        >
          <Audio src={staticFile("audio/answer.wav")} />
        </Sequence>
        <Sequence
          name="VO · Question suivante"
          from={849}
          durationInFrames={156}
          premountFor={30}
        >
          <Audio src={staticFile("audio/followup.wav")} />
        </Sequence>
        <Sequence
          name="VO · Mémoire"
          from={1031}
          durationInFrames={150}
          premountFor={30}
        >
          <Audio src={staticFile("audio/memory.wav")} />
        </Sequence>
        <Sequence
          name="VO · TV"
          from={1208}
          durationInFrames={120}
          premountFor={30}
        >
          <Audio src={staticFile("audio/tv.wav")} />
        </Sequence>
        <Sequence
          name="VO · Mac"
          from={1358}
          durationInFrames={75}
          premountFor={30}
        >
          <Audio src={staticFile("audio/mac.wav")} />
        </Sequence>
        <Sequence
          name="VO · GX10"
          from={1475}
          durationInFrames={140}
          premountFor={30}
        >
          <Audio src={staticFile("audio/future.wav")} />
        </Sequence>
        <Sequence
          name="VO · Signature"
          from={1623}
          durationInFrames={113}
          premountFor={30}
        >
          <Audio src={staticFile("audio/end.wav")} />
        </Sequence>
      </>
    )}
  </>
);
