import { useNavigation } from "../state/navigation";
import { HomeView } from "./home";
import { CompressView } from "../tools/compress/view";
import { AtlasPackView } from "../tools/atlas-pack/view";
import { AtlasIncrementalView } from "../tools/atlas-incremental/view";
import { AtlasUnpackView } from "../tools/atlas-unpack/view";

export function Workspace() {
  const { currentTool } = useNavigation();

  switch (currentTool) {
    case "home":
      return <HomeView />;
    case "compress":
      return <CompressView />;
    case "atlas-pack":
      return <AtlasPackView />;
    case "atlas-incremental":
      return <AtlasIncrementalView />;
    case "atlas-unpack":
      return <AtlasUnpackView />;
  }
}
