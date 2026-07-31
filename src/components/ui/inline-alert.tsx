import type { ReactNode } from "react";
import { CheckIcon, WarningIcon } from "@/components/ui/icons";

export function InlineAlert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  children?: ReactNode;
}) {
  const Icon = tone === "success" ? CheckIcon : WarningIcon;
  return (
    <div
      className={`inline-alert alert-${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon size={20} />
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
