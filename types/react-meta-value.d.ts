import "react";

declare module "react" {
  // The generic parameter must match React's declaration for interface merging.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface MetaHTMLAttributes<_T> {
    value?: string;
  }
}
