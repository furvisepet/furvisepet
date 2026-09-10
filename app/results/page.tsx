"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppPage } from "../components/app-page";

export default function ResultsPage() {
  return (
    <Suspense fallback={<AppPage>{null}</AppPage>}>
      <ResultsRedirect />
    </Suspense>
  );
}

function ResultsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profileId") || "";

  useEffect(() => {
    router.replace(profileId ? `/pets/${encodeURIComponent(profileId)}` : "/pets");
  }, [profileId, router]);

  return <AppPage><p className="py-8 text-[var(--text-secondary)]" role="status">Opening pet details...</p></AppPage>;
}

