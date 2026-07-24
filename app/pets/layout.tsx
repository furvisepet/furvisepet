import type { Metadata } from "next";
import { PrivateRouteLayout } from "../components/private-route-layout";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata("Pets");

export default PrivateRouteLayout;
