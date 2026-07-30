import type { Metadata } from "next";
import { PrivateRouteLayout } from "../components/private-route-layout";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata(
  "Products",
  "Find food, grooming, dental, and everyday care products for your pet.",
);

export default PrivateRouteLayout;
