import { statusTone } from "@/lib/ux/status";

/** Цветной бейдж статуса главы. */
export default function StatusBadge({ status, label, prefix, ...rest }: { status: string; label: string; prefix?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} className={`sa-status sa-status-${statusTone(status)}`}>
      {prefix}
      {label}
    </span>
  );
}
