import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// project: Blacksmith pills (rounded-full, no rounded-md on the sizes); their label-md type is in compoundVariants.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // project: button-primary-hover (--primary-hover) rather than a translucent primary.
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        // project: white (--button-outline) on the grey page, with a charcoal border on hover (theme variables in index.css).
        outline:
          "border bg-button-outline shadow-xs hover:border-button-outline-border-hover dark:border-input dark:hover:border-button-outline-border-hover",
        // project: for creating (ButtonNew), from the --success theme variable in index.css.
        success: "bg-success text-success-foreground hover:bg-success/90",
        // project: Blacksmith hovers by border emphasis, not by fading the yellow (--color-primary is shadcn's primary: charcoal).
        secondary:
          "bg-secondary text-secondary-foreground hover:shadow-[inset_0_0_0_2px_var(--color-primary)]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        // project: button-link is body-sm in the text colour (padding and rounding in compoundVariants, after the sizes).
        link: "body-sm text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        // project: Blacksmith's full-size call to action (171 × 82, 32px padding).
        xl: "h-[82px] min-w-[171px] px-8 has-[>svg]:px-8",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    // project: every button but a link speaks label-md (not in the base: CSS order would let it beat link's body-sm),
    // and a link has no box whatever its size.
    compoundVariants: [
      { variant: ["default", "destructive", "outline", "success", "secondary", "ghost"], class: "label-md" },
      { variant: "link", class: "h-auto min-w-0 rounded-none p-0 has-[>svg]:px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
