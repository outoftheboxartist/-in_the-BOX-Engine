declare module "gifuct-js" {
  export interface GIFFrame {
    dims: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
    patch: Uint8ClampedArray;
    delay: number;
    disposalType: number;
  }
  export function parseGIF(buffer: ArrayBuffer): any;
  export function decompressFrames(gif: any, buildImages: boolean): GIFFrame[];
}
