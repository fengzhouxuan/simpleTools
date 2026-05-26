// 给一个文件路径，按候选扩展名生成同目录同名候选列表
// 例：("/a/b/atlas.png", [".json", ".plist"]) → ["/a/b/atlas.json", "/a/b/atlas.plist"]
export function siblingCandidates(basePath: string, exts: string[]): string[] {
  if (!basePath) return [];
  const noExt = basePath.replace(/\.[^./\\]+$/, "");
  return exts.map((ext) => noExt + ext);
}

// 候选元数据扩展名（按优先级排序，json 最常见）
export const METADATA_EXT_CANDIDATES = [".json", ".plist", ".css"];

// 候选 atlas 图片扩展名
export const ATLAS_IMAGE_EXT_CANDIDATES = [".png", ".webp", ".jpg", ".jpeg"];

// 根据 atlas 路径，找同目录同名第一个存在的元数据文件
export async function guessMetadataForAtlas(
  atlasPath: string,
): Promise<string | null> {
  if (!atlasPath) return null;
  const candidates = siblingCandidates(atlasPath, METADATA_EXT_CANDIDATES);
  return window.simpleImage.core.fs.firstExisting(candidates);
}

// 根据元数据路径，反向找同目录同名第一个存在的 atlas 图片
export async function guessAtlasForMetadata(
  metadataPath: string,
): Promise<string | null> {
  if (!metadataPath) return null;
  const candidates = siblingCandidates(metadataPath, ATLAS_IMAGE_EXT_CANDIDATES);
  return window.simpleImage.core.fs.firstExisting(candidates);
}
