import { createPrivatePageMetadata } from "../lib/seo";

export const metadata = createPrivatePageMetadata("Catalog test");

export default function CatalogLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
