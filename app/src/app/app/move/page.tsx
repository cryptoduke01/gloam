import { redirect } from "next/navigation";
export default function MovePage() {
  redirect("/app/vault?tab=move");
}
