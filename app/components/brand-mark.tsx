import Image from "next/image";

export const FURVISE_BRAND_ASSET = "/brand/furvise-logo.svg";
export const FURVISE_WORDMARK_ASSET = "/brand/furvise-wordmark.svg";
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

  if (showName) {
    const heronSize = `calc(${responsiveSize} * 0.85)`;

    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        data-ui="brand-mark"
        style={{
          columnGap: "6px",
          height: responsiveSize,
          width: `calc(${responsiveSize} * 4)`,
        }}
      >
        <span className="h-full min-w-0 flex-1">
          <Image
            alt="Furvise"
            className="block h-full w-full object-contain"
            height={800}
            loading={priority ? "eager" : "lazy"}
            src={FURVISE_WORDMARK_ASSET}
            style={{
              height: "100%",
              objectFit: "contain",
              width: "100%",
            }}
            unoptimized
            width={3000}
          />
        </span>
        <Image
          alt=""
          aria-hidden="true"
          className="block shrink-0 object-contain"
          height={2000}
          loading={priority ? "eager" : "lazy"}
          src={FURVISE_MASCOT_ASSET}
          style={{
            height: heronSize,
            objectFit: "contain",
            width: heronSize,
          }}
          unoptimized
          width={2000}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      data-ui="brand-mark"
      style={{
        height: responsiveSize,
        width: responsiveSize,
      }}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="block shrink-0 object-contain"
        height={2000}
        loading={priority ? "eager" : "lazy"}
        src={FURVISE_MASCOT_ASSET}
        style={{
          height: responsiveSize,
          objectFit: "contain",
          width: responsiveSize,
        }}
        unoptimized
        width={2000}
      />
    </span>
  );
}
