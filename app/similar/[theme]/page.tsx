import {
  loadSimilarItems,
  type SimilarTheme,
} from "@/lib/data/similar/similar-loader";
import { notFound } from "next/navigation";

import { SimilarDrillClient } from "./similar-drill-client";

interface SimilarThemePageProps {
  params: Promise<{
    theme: string;
  }>;
}

function isSimilarTheme(theme: string): theme is SimilarTheme {
  return theme === "and" || theme === "want_to";
}

export default async function SimilarThemePage({
  params,
}: SimilarThemePageProps) {
  const { theme } = await params;

  if (!isSimilarTheme(theme)) {
    notFound();
  }

  const items = loadSimilarItems(theme);

  return <SimilarDrillClient items={items} theme={theme} />;
}
