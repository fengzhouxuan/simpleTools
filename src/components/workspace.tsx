import { useNavigation } from "../state/navigation";
import { HomeView } from "./home";
import { ErrorBoundary } from "./error-boundary";
import { CompressView } from "../tools/compress/view";
import { AtlasPackView } from "../tools/atlas-pack/view";
import { AtlasIncrementalView } from "../tools/atlas-incremental/view";
import { AtlasUnpackView } from "../tools/atlas-unpack/view";
import { IconGenView } from "../tools/icon-gen/view";
import { ImageDiffView } from "../tools/image-diff/view";
import { BatchRenameView } from "../tools/batch-rename/view";
import { MetadataStripView } from "../tools/metadata-strip/view";
import { toolMeta } from "../tools/tool-meta";

function renderTool(currentTool: ReturnType<typeof useNavigation>["currentTool"]) {
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
    case "icon-gen":
      return <IconGenView />;
    case "image-diff":
      return <ImageDiffView />;
    case "batch-rename":
      return <BatchRenameView />;
    case "metadata-strip":
      return <MetadataStripView />;
  }
}

export function Workspace() {
  const { currentTool } = useNavigation();
  // 切工具时强制重 mount ErrorBoundary，让上一个工具的错误状态清空
  return (
    <ErrorBoundary key={currentTool} contextLabel={toolMeta[currentTool].label}>
      {renderTool(currentTool)}
    </ErrorBoundary>
  );
}
