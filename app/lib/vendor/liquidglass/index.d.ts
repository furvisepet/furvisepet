export type LiquidGlassInstance = {
  destroy(): void;
  markChanged(element?: HTMLElement): void;
};

export type LiquidGlassOptions = {
  root: HTMLElement;
  glassElements?: NodeListOf<HTMLElement> | HTMLElement[];
  defaults?: Partial<{
    blurAmount: number;
    refraction: number;
    chromAberration: number;
    edgeHighlight: number;
    specular: number;
    fresnel: number;
    distortion: number;
    cornerRadius: number;
    zRadius: number;
    opacity: number;
    saturation: number;
    tintStrength: number;
    brightness: number;
    shadowOpacity: number;
    shadowSpread: number;
    shadowOffsetY: number;
    floating: boolean;
    button: boolean;
    bevelMode: number;
  }>;
};

export declare class LiquidGlass {
  static init(options: LiquidGlassOptions): Promise<LiquidGlassInstance>;
}
