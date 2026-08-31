import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  // Request-time render so Vercel doesn't serve a stale static shell
  await headers();
  // AdminDashboard is a Client Component ("use client"), no next/dynamic ssr:false needed
  return <AdminDashboard />;
}
