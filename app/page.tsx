import type { Metadata } from "next";
import { HomepageClient } from "./components/homepage-client";

export const metadata: Metadata = {
  title: "Furvise - Connected pet care history",
  description:
    "Furvise keeps symptoms, food notes, grooming, memories, and product feedback connected for every pet you love.",
};

export default function HomePage() {
  return <HomepageClient />;
}
