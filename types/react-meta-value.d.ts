import "react";

declare module "react" {
  interface MetaHTMLAttributes<T> {
    value?: string;
  }
}
