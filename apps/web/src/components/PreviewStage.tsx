"use client";

import dynamic from "next/dynamic";

const CompositionPreview = dynamic(
  () => import("@/components/CompositionPreview").then((mod) => mod.CompositionPreview),
  {
    ssr: false,
    loading: () => <div className="h-[500px] w-[280px] rounded-[28px] bg-surface" />,
  },
);

export function PreviewStage() {
  return <CompositionPreview />;
}
