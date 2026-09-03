import { PrivateRouteLayout } from "../components/private-route-layout";
import { createPrivatePageMetadata } from "../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createPrivatePageMetadata("Vet Brief");

export default PrivateRouteLayout;
