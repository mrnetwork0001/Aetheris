import * as React from "react";

import { cn } from "@/lib/utils";

export interface TableProps extends React.ComponentPropsWithoutRef<"table"> {
  /** Class for the scrolling wrapper. */
  wrapperClassName?: string;
}

/** Flush table: drop inside `<Card flush>`. Scrolls horizontally instead of the page. */
export function Table({ className, wrapperClassName, ...props }: TableProps) {
  return (
    <div className={cn("w-full overflow-x-auto", wrapperClassName)}>
      <table className={cn("fl-table", className)} {...props} />
    </div>
  );
}

export function THead(props: React.ComponentPropsWithoutRef<"thead">) {
  return <thead {...props} />;
}

export function TBody(props: React.ComponentPropsWithoutRef<"tbody">) {
  return <tbody {...props} />;
}

export interface TRProps extends React.ComponentPropsWithoutRef<"tr"> {
  /** Pointer cursor + keyboard affordance for expandable rows. */
  interactive?: boolean;
}

export function TR({ className, interactive = false, ...props }: TRProps) {
  return <tr className={cn(interactive && "cursor-pointer", className)} {...props} />;
}

type Align = "left" | "right" | "center";

const ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export interface CellProps {
  align?: Align;
  /** JetBrains Mono, tabular numerals — for amounts, sequence numbers, hashes. */
  mono?: boolean;
}

export function TH({
  className,
  align = "left",
  mono = false,
  scope = "col",
  ...props
}: React.ComponentPropsWithoutRef<"th"> & CellProps) {
  return (
    <th
      scope={scope}
      className={cn(ALIGN[align], mono && "font-mono", className)}
      {...props}
    />
  );
}

export function TD({
  className,
  align = "left",
  mono = false,
  ...props
}: React.ComponentPropsWithoutRef<"td"> & CellProps) {
  return (
    <td
      className={cn(ALIGN[align], mono && "font-mono text-[0.8rem] tabular-nums", className)}
      {...props}
    />
  );
}
