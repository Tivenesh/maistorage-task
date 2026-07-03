"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { forwardRef, type CSSProperties } from "react";

export const spring = {
  soft: {
    type: "spring" as const,
    stiffness: 220,
    damping: 24,
    mass: 0.9,
  },
  panel: {
    type: "spring" as const,
    stiffness: 240,
    damping: 26,
    mass: 0.85,
  },
  button: {
    type: "spring" as const,
    stiffness: 280,
    damping: 24,
    mass: 0.72,
  },
  icon: {
    type: "spring" as const,
    stiffness: 360,
    damping: 26,
    mass: 0.65,
  },
};

export const panelVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    filter: "blur(10px)",
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    filter: "blur(8px)",
  },
};

export const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.985,
    filter: "blur(4px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.98,
    filter: "blur(4px)",
  },
};

const standardSpring = {
  type: "spring" as const,
  stiffness: 260,
  damping: 24,
  mass: 0.75,
};

const iconSpring = {
  type: "spring" as const,
  stiffness: 360,
  damping: 26,
  mass: 0.65,
};

type MotionButtonProps = HTMLMotionProps<"button"> & {
  interaction?: "standard" | "icon";
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(function MotionButton({
  interaction = "standard",
  className,
  disabled,
  layout,
  style,
  transition,
  whileFocus,
  whileHover,
  whileTap,
  ...props
}, ref) {
  const isIcon = interaction === "icon";
  const hoverState = isIcon
    ? {
        scale: 1.1,
        y: -1.5,
        filter: "brightness(1.08)",
        boxShadow: "var(--shadow-md)",
      }
    : {
        scale: 1.025,
        y: -1.5,
        filter: "brightness(1.06)",
        boxShadow: "var(--shadow-md)",
      };
  const tapState = isIcon
    ? {
        scale: 0.94,
        y: 0.5,
        filter: "brightness(0.96)",
        boxShadow: "var(--shadow-sm)",
      }
    : {
        scale: 0.98,
        y: 0.5,
        filter: "brightness(0.98)",
        boxShadow: "var(--shadow-sm)",
      };

  return (
    <motion.button
      ref={ref}
      className={typeof className === "string" ? `motion-control ${className}` : className}
      disabled={disabled}
      layout={layout ?? "position"}
      style={
        {
          transformOrigin: "center",
          willChange: "transform, filter",
          ...style,
        } as CSSProperties
      }
      transition={transition ?? (isIcon ? iconSpring : standardSpring)}
      whileFocus={disabled ? undefined : whileFocus ?? hoverState}
      whileHover={disabled ? undefined : whileHover ?? hoverState}
      whileTap={disabled ? undefined : whileTap ?? tapState}
      {...props}
    />
  );
});
