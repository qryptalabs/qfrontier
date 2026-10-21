import type { Metadata } from "next";
import "./mvp.css";
import "./graphics/premium.css";

export const metadata: Metadata = {
  title: "QFrontier · Frontera Cero",
  description: "Explora 81 territorios, fabrica, cultiva y coordina contratos y comunidades en la primera frontera de QRYPTA.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
