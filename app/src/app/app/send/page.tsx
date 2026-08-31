import { redirect } from "next/navigation";
export default function SendPage() {
  redirect("/app/vault?tab=send");
}
