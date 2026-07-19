import { Suspense } from "react";
import { CareLogWorkspace } from "../components/care-log-workspace";

export default function CareLogPage() {
  return (
    <Suspense fallback={null}>
      <CareLogWorkspace scope="global" />
    </Suspense>
  );
}
