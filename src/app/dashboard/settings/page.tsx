import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="text-muted-foreground mt-1">
        Configure your account and preferences.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <Settings className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">Settings</p>
        <p className="text-sm text-muted-foreground">
          Account and application settings will be available here.
        </p>
      </div>
    </div>
  );
}
