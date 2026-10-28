import { redirect } from "next/navigation";

// The hand-filled form was replaced by statements built from the journal.
export default function Page() {
  redirect("/reports#bs");
}
