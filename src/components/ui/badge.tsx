import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "text-foreground border border-input",
        success: "bg-green-100 text-green-800",
        warning: "bg-yellow-100 text-yellow-800",
        info: "bg-blue-100 text-blue-800",
        "success-gradient": "border-none bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600",
        "primary-gradient": "border-none bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:from-blue-600 hover:to-violet-600",
        "secondary-gradient": "border-none bg-gradient-to-r from-gray-500 to-slate-500 text-white hover:from-gray-600 hover:to-slate-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
