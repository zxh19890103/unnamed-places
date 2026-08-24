import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import clsx from "clsx";
import React from "react";
import { Button, IconButton } from "./Button";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];

type Props = {
  trigger?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  actionLabel?: React.ReactNode;
  actionVariant?: ButtonVariant;
  className?: string;
  onCancel?: () => void;
  onAction?: () => void;
  zIndex?: number;
};

type AlertState = Props & {
  id: string;
  z: number;
};

type AlertController = {
  create: (options?: Partial<Props>) => string;
  close: (id: string) => void;
  confirm: (options?: Partial<Props>) => string;
};

type AlertComponent = React.FC<Props> & {
  create: (options?: Partial<Props>) => string;
  confirm: (options?: Partial<Props>) => string;
  __storybook: () => Props;
};

type AlertContextValue = AlertController;

const AlertContext = React.createContext<AlertContextValue | null>(null);

let activeController: AlertController | null = null;

export const AlertProvider = ({ children }: React.PropsWithChildren) => {
  const [alerts, setAlerts] = React.useState<AlertState[]>([]);
  const sequenceRef = React.useRef(0);

  const close = React.useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const create = React.useCallback((options: Partial<Props> = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sequenceRef.current += 1;

    setAlerts((current) => [
      ...current,
      {
        id,
        z: sequenceRef.current,
        ...options,
      },
    ]);

    return id;
  }, []);

  const confirm = React.useCallback(
    (options: Partial<Props> = {}) => create(options),
    [create],
  );

  const contextValue = React.useMemo<AlertContextValue>(
    () => ({ create, close, confirm }),
    [close, confirm, create],
  );

  React.useEffect(() => {
    activeController = contextValue;
    return () => {
      if (activeController === contextValue) {
        activeController = null;
      }
    };
  }, [contextValue]);

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[9999]">
        {alerts.map((alert) => (
          <Alert
            key={alert.id}
            {...alert}
            open
            zIndex={alert.z}
            onOpenChange={(open) => {
              if (!open) close(alert.id);
            }}
            onCancel={() => close(alert.id)}
            onAction={() => close(alert.id)}
          />
        ))}
      </div>
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = React.useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
};

const AlertBase = ({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  children,
  cancelLabel = "Cancel",
  actionLabel = "Continue",
  actionVariant = "primary",
  className,
  onCancel,
  onAction,
  zIndex,
}: Props & { zIndex?: number }) => {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);
  };

  return (
    <AlertDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
    >
      {trigger ? (
        <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      ) : null}

      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className="fixed inset-0 bg-jade-950/45 backdrop-blur-[2px]"
          style={{ zIndex }}
        />
        <AlertDialog.Content
          className={clsx(
            "fixed left-1/2 top-1/2 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-jade-border-soft bg-jade-panel p-5 text-jade-text shadow-[0_20px_60px_rgba(24,42,54,0.2)]",
            className,
          )}
          style={{ zIndex }}
        >
          <div className="flex items-start gap-4">
            <div className=" flex-1 min-w-0">
              <AlertDialog.Title className="text-base font-semibold text-jade-text">
                {title}
              </AlertDialog.Title>
              {description ? (
                <AlertDialog.Description className="mt-2 text-sm leading-6 text-jade-text-muted">
                  {description}
                </AlertDialog.Description>
              ) : null}
            </div>
            <AlertDialog.Cancel asChild>
              <IconButton
                variant="destructive"
                size="sm"
                aria-label="Close dialog"
              >
                <Cross2Icon />
              </IconButton>
            </AlertDialog.Cancel>
          </div>

          {children ? <div className="mt-4">{children}</div> : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button size="sm" variant="secondary" onClick={onCancel}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button size="sm" variant={actionVariant} onClick={onAction}>
                {actionLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

export const Alert = AlertBase as AlertComponent;

Alert.create = (options: Partial<Props> = {}) => {
  return activeController?.create(options) ?? "";
};

Alert.confirm = (options: Partial<Props> = {}) => {
  return activeController?.confirm(options) ?? "";
};

Alert.__storybook = (): Props => ({
  trigger: (
    <Button variant="primary" size="sm">
      Share view
    </Button>
  ),
  title: "Share this selection",
  description:
    "Create a shareable link for the current map view and selected river segment.",
  actionLabel: "Create link",
});
