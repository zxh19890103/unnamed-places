import clsx from "clsx";
import type { ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ComponentStoryBook } from "./_types";

export type TabItem = {
  value: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
};

type Props = {
  items?: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  listClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
  orientation?: "horizontal" | "vertical";
};

export const Tab = ({
  items = [],
  defaultValue,
  value,
  onValueChange,
  className,
  listClassName,
  triggerClassName,
  contentClassName,
  orientation = "horizontal",
}: Props) => {
  if (items.length === 0) {
    return null;
  }

  const resolvedDefaultValue = defaultValue ?? items[0]?.value ?? "";

  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={resolvedDefaultValue}
      onValueChange={onValueChange}
      orientation={orientation}
      className={clsx("w-full", className)}
    >
      <TabsPrimitive.List
        className={clsx(
          "flex items-center gap-2 border-b border-jade-border-soft/70 pb-2",
          orientation === "vertical" ? "flex-col items-stretch" : "flex-row",
          listClassName,
        )}
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={clsx(
              "rounded-md px-3 py-2 text-sm font-medium text-jade-text-muted transition-colors duration-150 hover:bg-jade-control hover:text-jade-text focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-jade-river data-[state=active]:border-jade-river/30 data-[state=active]:bg-jade-river-soft data-[state=active]:text-jade-river disabled:cursor-not-allowed disabled:opacity-50",
              triggerClassName,
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.value}
          value={item.value}
          className={clsx("pt-3 text-sm text-jade-text", contentClassName)}
        >
          {item.content ?? null}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
};

Tab.__storybook = (): ComponentStoryBook<Props> => {
  return {
    defaultValue: "overview",
    items: [
      {
        value: "overview",
        label: "Overview",
        content: (
          <div className="rounded-lg border border-jade-border-soft bg-jade-panel/70 p-3 text-sm text-jade-text">
            Summary of the current selection and available actions.
          </div>
        ),
      },
      {
        value: "details",
        label: "Details",
        content: (
          <div className="rounded-lg border border-jade-border-soft bg-jade-panel/70 p-3 text-sm text-jade-text">
            Additional context, status, and supporting information.
          </div>
        ),
      },
      {
        value: "history",
        label: "History",
        content: (
          <div className="rounded-lg border border-jade-border-soft bg-jade-panel/70 p-3 text-sm text-jade-text">
            Recent activity and timeline entries for this item.
          </div>
        ),
      },
    ],
  };
};
