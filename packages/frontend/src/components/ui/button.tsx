import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-[#062426] hover:brightness-105",
  secondary: "border-border bg-surface text-foreground hover:bg-surface-muted",
  ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground",
  danger: "border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/15",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
