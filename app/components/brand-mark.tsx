import Image from "next/image";

export const FURVISE_BRAND_ASSET = "/brand/furvise-logo.svg";
export const FURVISE_MASCOT_ASSET = "/brand/furvise-heron.svg";

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
        width: showName ? `calc(${responsiveSize} * 4)` : responsiveSize,
      }}
    >
      <Image
        alt={showName ? "Furvise" : ""}
        aria-hidden={showName ? undefined : "true"}
        className="block shrink-0 object-contain"
        height={showName ? 800 : 2000}
        priority={priority}
        src={asset}
        style={showName
          ? {
              height: "100%",
              objectFit: "contain",
              width: "100%",
            }
          : {
              height: responsiveSize,
              objectFit: "contain",
              width: responsiveSize,
            }}
        unoptimized
        width={showName ? 3200 : 2000}
      />
    </span>
  );
}
