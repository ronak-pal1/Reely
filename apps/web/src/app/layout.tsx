import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REELIO",
  description: "AI video editor for short-form vertical content.",
};

const themeBoot = `
try {
  var theme = localStorage.getItem("reelio-theme");
  if (theme === "light") document.documentElement.classList.remove("dark");
  else document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
