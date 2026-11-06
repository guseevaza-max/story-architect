"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isThemedPath } from "@/lib/ux/theme";

/** Тёмная/светлая тема по выбору автора — на переведённых страницах, остальные пока светлые. */
export default function ThemeScope({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className={isThemedPath(pathname) ? "scope-themed" : "scope-legacy"}>{children}</div>;
}
