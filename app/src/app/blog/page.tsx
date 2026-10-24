import { redirect } from "next/navigation";

/** Posts live under /blog/<slug>; the list of them is /research. */
export default function BlogIndex() {
  redirect("/research");
}
