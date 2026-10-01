import { AbsoluteFill, Composition, Folder, Sequence } from "remotion";
import { Watching } from "./scenes/Watching";
import { Context } from "./scenes/Context";
import { Evidence, SourceFocus } from "./scenes/Evidence";
import { FollowUp, Memory } from "./scenes/Memory";
import { Platforms } from "./scenes/Platforms";
import { Future, EndCard } from "./scenes/Future";
import { Soundtrack } from "./Soundtrack";
type FilmProps = { voice: boolean };
export const Film = ({ voice = true }: FilmProps) => (
  <AbsoluteFill style={{ background: "#07191f" }}>
    <Sequence
      name="01 · Doute, panneau, question"
      from={0}
      durationInFrames={330}
      premountFor={30}
    >
      <Watching />
    </Sequence>
    <Sequence
      name="02 · Le contexte automatique"
      from={330}
      durationInFrames={150}
      premountFor={30}
    >
      <Context />
    </Sequence>
    <Sequence
      name="03 · Réponse et preuves"
      from={480}
      durationInFrames={240}
      premountFor={30}
    >
      <Evidence />
    </Sequence>
    <Sequence
      name="04 · Lire la source"
      from={720}
      durationInFrames={120}
      premountFor={30}
    >
      <SourceFocus />
    </Sequence>
    <Sequence
      name="05 · Et avant ?"
      from={840}
      durationInFrames={180}
      premountFor={30}
    >
      <FollowUp />
    </Sequence>
    <Sequence
      name="06 · Mémoire du programme"
      from={1020}
      durationInFrames={180}
      premountFor={30}
    >
      <Memory />
    </Sequence>
    <Sequence
      name="07 · LG TV vers Mac"
      from={1200}
      durationInFrames={270}
      premountFor={30}
    >
      <Platforms />
    </Sequence>
    <Sequence
      name="08 · Next experiment GX10"
      from={1470}
      durationInFrames={150}
      premountFor={30}
    >
      <Future />
    </Sequence>
    <Sequence
      name="09 · TVLens"
      from={1620}
      durationInFrames={120}
      premountFor={30}
    >
      <EndCard />
    </Sequence>
    <Soundtrack voice={voice} />
  </AbsoluteFill>
);
export const Root = () => (
  <>
    <Composition
      id="TVLens-Context"
      component={Film}
      durationInFrames={1740}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ voice: true }}
    />
    <Folder name="Scenes">
      <Composition
        id="01-Watching"
        component={Watching}
        durationInFrames={330}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="02-Context"
        component={Context}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="03-Evidence"
        component={Evidence}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="04-Source"
        component={SourceFocus}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="05-Followup"
        component={FollowUp}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="06-Memory"
        component={Memory}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="07-Platforms"
        component={Platforms}
        durationInFrames={270}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="08-Future"
        component={Future}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="09-End"
        component={EndCard}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  </>
);
