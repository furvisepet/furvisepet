"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { PetAvatar, PetIdentity } from "./product-primitives";
import { loadLocalPhoto, type LocalPhotoKind } from "../lib/local-pet-media";

export function LocalPhoto({ alt, id, kind, className = "" }: { alt: string; className?: string; id: string; kind: LocalPhotoKind }) {
  const source = useLocalPhoto(kind, id);
  return source ? <Image alt={alt} className={`object-cover ${className}`} height={480} src={source} unoptimized width={640} /> : null;
}

export function LocalPetAvatar({ className = "", id, name, size = "medium" }: { className?: string; id: string; name: string; size?: "small" | "medium" | "large" }) {
  const source = useLocalPhoto("pet", id);
  return <PetAvatar className={className} name={name} photoUrl={source} size={size} />;
}

export function LocalPetIdentity({ detail, id, name, size = "default" }: { detail?: React.ReactNode; id: string; name: string; size?: "default" | "large" }) {
  const source = useLocalPhoto("pet", id);
  return <PetIdentity detail={detail} name={name} photoUrl={source} size={size} />;
}

function useLocalPhoto(kind: LocalPhotoKind, id: string) {
  return useSyncExternalStore(subscribe, () => loadLocalPhoto(kind, id), getServerSnapshot);
}

function subscribe() {
  return () => undefined;
}

function getServerSnapshot() {
  return "";
}
