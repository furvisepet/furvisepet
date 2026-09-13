import { Suspense } from "react";
import { HistoryArchive } from "../components/history-archive";

export default function HistoryPage() {
  return <Suspense fallback={null}><HistoryArchive /></Suspense>;
}
