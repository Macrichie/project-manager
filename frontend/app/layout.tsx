import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Forma | Project board", description: "A clear space for your ideas, your progress, and your next big thing." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
