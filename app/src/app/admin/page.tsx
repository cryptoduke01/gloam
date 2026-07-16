import type { Metadata } from "next";
import nextDynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/** Always render on demand — avoid stale static shell for auth UI */
export const dynamic = "force-dynamic";

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

export default function AdminPage() {
  return <AdminDashboard />;
}
