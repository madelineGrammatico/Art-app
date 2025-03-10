import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/src/components/Header";
import { Separator } from "@/src/components/ui/separator"
import SessionWrapper from "@/src/lib/auth/SessionWrapper"
import NavBar from "@/src/components/NavBar";
import { auth } from "@/src/lib/auth/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ART APP",
  description: "Generated by create next app",
};

export default async function  RootLayout({ children }: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth()
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased h-full px-32 py-6 bg-slate-400`}
      >
        <SessionWrapper>
          <Header>
            <NavBar/>
          </Header>
          <Separator/>
            <span>{JSON.stringify(session?.user.role)}</span>
          <Separator/>
          <div className="flex flex-col gap-4 py-4">
            {children}
          </div>
        </SessionWrapper>
      </body>
    </html>
  );
}
