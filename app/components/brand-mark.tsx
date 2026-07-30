import Image from "next/image";

export const FURVISE_BRAND_ASSET = "/brand/logo.png";
export const FURVISE_MASCOT_ASSET = "/App%20icon.png";

export function BrandMark({
  className = "",
  priority = false,
  showName = true,
  size = 30,
}: {
  className?: string;
  priority?: boolean;
  showName?: boolean;
  size?: number;
}) {
  const responsiveSize = `var(--brand-mark-size, ${size}px)`;
  const asset = showName ? FURVISE_BRAND_ASSET : FURVISE_MASCOT_ASSET;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${showName ? "overflow-hidden" : ""} ${className}`}
      style={{
        height: responsiveSize,
        width: showName ? `calc(${responsiveSize} * 3.2)` : responsiveSize,
      }}
    >
      <Image
        alt={showName ? "Furvise" : ""}
        aria-hidden={showName ? undefined : "true"}
        className="block shrink-0 object-contain"
        height={showName ? 1024 : 1254}
        priority={priority}
        src={asset}
        style={showName
          ? {
              height: "auto",
              maxWidth: "none",
              objectFit: "contain",
              transform: `translateY(calc(${responsiveSize} * 0.117)) scale(2.75)`,
              width: `calc(${responsiveSize} * 1.5)`,
            }
          : {
              height: responsiveSize,
              objectFit: "contain",
              width: responsiveSize,
            }}
        unoptimized
        width={showName ? 1536 : 1254}
      />
    </span>
  );
}
