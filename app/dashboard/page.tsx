import { permanentRedirect } from "next/navigation";

type LegacyDashboardSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacyDashboardPage({ searchParams }: { searchParams: LegacyDashboardSearchParams }) {
  const legacyParams = await searchParams;
  const nextParams = new URLSearchParams();

  Object.entries(legacyParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => nextParams.append(key, item));
    else if (value !== undefined) nextParams.set(key, value);
  });

  permanentRedirect(nextParams.size ? `/today?${nextParams.toString()}` : "/today");
}
