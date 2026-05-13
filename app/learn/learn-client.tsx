"use client";

import dynamic from "next/dynamic";

const LearnSession = dynamic(() => import("@/components/learn-session"), {
  ssr: false,
});

export function LearnClient() {
  return <LearnSession />;
}
