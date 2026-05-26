import type {
  AtlasExportPayload,
  AtlasExportResult,
  AtlasIncrementalDiff,
  AtlasIncrementalPayload,
  AtlasIncrementalResult,
  AtlasInspectResult,
  AtlasPackOptions,
  AtlasPackResult,
  AtlasUnpackPayload,
  AtlasUnpackResult,
  CompressPayload,
  CompressionResult,
  InputFile,
  TaskProgress,
} from "./types";

type AtlasIncrementalPreviewResult = {
  diff: AtlasIncrementalDiff;
  packResult: AtlasPackResult;
  manifest: { format: string; total: number } | null;
};

declare global {
  interface Window {
    simpleImage: {
      core: {
        fs: {
          pickFiles: () => Promise<InputFile[]>;
          pickFolder: () => Promise<string | null>;
          pickSingleFile: (
            filters?: { name: string; extensions: string[] }[],
          ) => Promise<string | null>;
          firstExisting: (paths: string[]) => Promise<string | null>;
          scanDirectory: (dirPath: string) => Promise<InputFile[]>;
          normalizePaths: (paths: string[]) => Promise<InputFile[]>;
          openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
          revealInFolder: (filePath: string) => Promise<{ ok: true }>;
        };
        webUtils: {
          getPathForFile: (file: File) => string;
        };
        settings: {
          get: <T = unknown>(key: string, defaultValue?: T) => Promise<T>;
          set: (key: string, value: unknown) => Promise<boolean>;
        };
      };
      tools: {
        compress: {
          run: (payload: CompressPayload) => Promise<CompressionResult[]>;
          onProgress: (callback: (p: TaskProgress) => void) => () => void;
        };
        atlasPack: {
          pack: (payload: AtlasPackOptions) => Promise<AtlasPackResult>;
          export: (payload: AtlasExportPayload) => Promise<AtlasExportResult>;
          onProgress: (callback: (p: TaskProgress) => void) => () => void;
        };
        atlasUnpack: {
          inspect: (payload: {
            atlasPath: string;
            metadataPath: string;
          }) => Promise<AtlasInspectResult>;
          export: (payload: AtlasUnpackPayload) => Promise<AtlasUnpackResult>;
        };
        atlasIncremental: {
          preview: (payload: {
            atlasPath: string;
            metadataPath: string;
            newSourcePaths: string[];
            maxWidth: number;
            maxHeight: number;
            padding: number;
            allowRotate: boolean;
            pot: boolean;
            trim: boolean;
          }) => Promise<AtlasIncrementalPreviewResult>;
          export: (
            payload: AtlasIncrementalPayload,
          ) => Promise<AtlasIncrementalResult>;
          clearCache: () => Promise<void>;
          onProgress: (callback: (p: TaskProgress) => void) => () => void;
        };
      };
    };
  }
}

export {};
