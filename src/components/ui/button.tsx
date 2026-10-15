import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,border-color,color,box-shadow] duration-150 select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 [&_svg]:size-[18px]",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-600 active:bg-brand-700 shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_1px_2px_rgb(47_71_151/0.25)]",
        secondary: "bg-surface text-ink border border-line-2 hover:bg-subtle hover:border-line-2 shadow-card",
        ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
        soft: "bg-brand-50 text-brand hover:bg-brand-100",
        success: "bg-success text-white hover:brightness-95",
        danger: "bg-danger text-white hover:brightness-95",
        "danger-ghost": "text-danger hover:bg-danger-50",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-md",
        md: "h-11 px-4 text-[15px] rounded-md",
        lg: "h-12 px-5 text-base rounded-lg",
        xl: "h-14 px-6 text-base rounded-lg",
        icon: "size-11 rounded-md",
        "icon-sm": "size-9 rounded-md",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, block, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, block }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (
        <>
          {loading && <span className="size-4 rounded-full border-2 border-current border-r-transparent animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
