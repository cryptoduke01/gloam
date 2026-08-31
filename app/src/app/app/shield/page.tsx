import { redirect } from "next/navigation";
export default function ShieldPage() {
  redirect("/app/vault?tab=shield");
}
