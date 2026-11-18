import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Button } from './Button.vue';

// Recall button (Figma: Components / Button). One size: 48px high, 24px of
// padding on the sides, 8px between an icon and the label. Width comes from
// the content, or from a class such as w-full.
export const buttonVariants = cva(
  [
    'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-ink px-6',
    'cursor-pointer select-none whitespace-nowrap font-mono text-sm font-bold shadow-hard',
    // A short ease on the lift and the press; none for people who ask for less motion.
    'transition-[translate,box-shadow,background-color] duration-100 ease-out motion-reduce:transition-none',
    // Hover: the button lifts 1px and the shadow grows by 1px
    'hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--ink)]',
    // Pressed: the button moves into its shadow.
    'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
    // Keyboard focus: a cobalt outline, kept clear of the border.
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    // Disabled: the same button at half strength.
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground active:bg-primary-pressed',
        secondary: 'bg-secondary text-secondary-foreground',
        missed: 'bg-missed text-foreground',
        got: 'bg-recalled text-foreground',
        danger: 'border-destructive bg-secondary text-destructive',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
