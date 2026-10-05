import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/kaloriai/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KaloriAI — Fotoğraf çek, kalorini bil",
  description:
    "AI destekli kalori ve beslenme takibi: yemek fotoğrafını çek, kalori ve makroları hesapla, hedeflerine ulaş. Türk mutfağı desteği.",
  keywords: ["kalori", "beslenme", "diyet", "kalori takibi", "AI", "makro", "sporcu beslenmesi"],
  authors: [{ name: "KaloriAI" }],
  manifest: "/manifest.webmanifest",
  applicationName: "KaloriAI",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KaloriAI",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7faf5" },
    { media: "(prefers-color-scheme: dark)", color: "#151a16" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var s=localStorage.getItem('kaloriai_skin');if(s==='glass'||s==='midnight'||s==='aurora'){document.documentElement.classList.add('skin-'+s)}}catch(e){}",
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
