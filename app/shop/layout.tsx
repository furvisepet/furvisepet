import type { Metadata } from "next";
import { PrivateRouteLayout } from "../components/private-route-layout";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata(
  "Products",
  "Search pet product ideas using your pet’s saved context. Furvise filters by species, country, and saved avoid ingredients when available.",
);

export default PrivateRouteLayout;
