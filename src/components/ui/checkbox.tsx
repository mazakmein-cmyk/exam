import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    /**
     * What the checked state draws inside the box. The box stays square either
     * way — the square is what says "more than one of these can be picked".
     *
     * "check" (default) is the tick, and it is the right glyph wherever a tick
     * means what a tick means: an author marking which options are correct.
     *
     * "dot" is for the student side. There a tick beside the option a student
     * just chose reads as "correct", which is a claim the paper has not made —
     * the answer key is not revealed while they are still answering. A dot says
     * "chosen" and nothing more.
     */
    indicator?: "check" | "dot";
  }
>(({ className, indicator = "check", ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      {indicator === "dot" ? (
        <span className="h-2 w-2 rounded-full bg-current" />
      ) : (
        <Check className="h-4 w-4" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
