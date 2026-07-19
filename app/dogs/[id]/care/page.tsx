"use client";

import { useParams } from "next/navigation";
import { CareLogWorkspace } from "../../../components/care-log-workspace";

export default function DogCarePage() {
  const params = useParams<{ id: string }>();
  return <CareLogWorkspace petProfileId={params.id} scope="pet" />;
}
