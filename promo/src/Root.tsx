import { Composition, Folder } from "remotion";
import { Film } from "./Film";
import { Teaser } from "./Teaser";
import { Opening } from "./scenes/Opening";
import { Question } from "./scenes/Question";
import { Mac } from "./scenes/Mac";
import { Floating } from "./scenes/Floating";
import { Television } from "./scenes/Television";
import { Evidence } from "./scenes/Evidence";
import { Local } from "./scenes/Local";
import { Closing } from "./scenes/Closing";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TVLens-Teaser"
        component={Teaser}
        durationInFrames={1020}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TVLens"
        component={Film}
        durationInFrames={1920}
        fps={30}
        width={1920}
        height={1080}
      />
      <Folder name="Scenes">
        <Composition
          id="Opening"
          component={Opening}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Question"
          component={Question}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Mac"
          component={Mac}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Floating"
          component={Floating}
          durationInFrames={240}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Television"
          component={Television}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Evidence"
          component={Evidence}
          durationInFrames={240}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Local"
          component={Local}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Closing"
          component={Closing}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
