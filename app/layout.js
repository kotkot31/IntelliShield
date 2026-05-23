import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { ModelProvider } from "@/contexts/model-context";
import { DataProvider } from "@/contexts/data-context";
import Navbar from "@/components/navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Fraud Detection App",
  description: "Web-based fraud detection transaction monitoring system",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <ModelProvider>
              <DataProvider>
                <Navbar />
                <main className="flex-1">{children}</main>
              </DataProvider>
            </ModelProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
