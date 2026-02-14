import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // Redirect to onboarding if user has no organization
  if (!session.user.organizationId) {
    redirect("/onboarding");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
