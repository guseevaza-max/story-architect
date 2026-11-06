import "./globals.css";
import { Lora, Onest } from "next/font/google";
import ThemeScope from "@/components/ThemeScope";
import ToastProvider from "@/components/Toast";
import { THEME_INIT_SCRIPT } from "@/lib/ux/theme";

const onest = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-ui", display: "swap" });
const lora = Lora({ subsets: ["latin", "cyrillic"], variable: "--font-read", display: "swap" });

export const metadata = {
  title: "Story Architect",
  description: "Рабочее пространство для работы над книгой",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" className={`${onest.variable} ${lora.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>
          <ThemeScope>{children}</ThemeScope>
        </ToastProvider>
      </body>
    </html>
  );
}
