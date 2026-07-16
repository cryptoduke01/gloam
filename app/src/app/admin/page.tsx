import type { Metadata } from "next";
import { headers } from "next/headers";
import nextDynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AdminDashboard = nextDynamic(
  () =>
    import("@/components/admin/AdminDashboard").then((m) => m.AdminDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-full items-center justify-center bg-background">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
          Loading admin…
        </p>
      </div>
    ),
  },
);

export default async function AdminPage() {
  // Opt into request-time rendering (avoids stale static /admin shell on Vercel)
  await headers();
  return <AdminDashboard />;
}
