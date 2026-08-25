import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  CheckCircledIcon,
  Cross2Icon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import clsx from "clsx";
import React, { useRef } from "react";
import { Button, IconButton } from "./Button";
import { ComponentStoryBook } from "./_types";

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
  showCloseButton?: boolean;
};

type AlertState = Props & {
  id: string;
  z: number;
  closing?: boolean;
};

type AlertController = {
  create: (options?: Partial<Props>) => Promise<string>;
  confirm: (text: React.ReactNode, title?: string) => Promise<string>;
  close: (id: string) => void;

  alert: (text: React.ReactNode, title?: string) => Promise<string>;
  info: (text: React.ReactNode, title?: string) => Promise<string>;
  error: (text: React.ReactNode, title?: string) => Promise<string>;
  warn: (text: React.ReactNode, title?: string) => Promise<string>;
  success: (text: React.ReactNode, title?: string) => Promise<string>;
};

type AlertComponent = React.FC<Props> & {
  create: (options?: Partial<Props>) => Promise<string>;
  confirm: (text: React.ReactNode, title?: string) => Promise<string>;
  alert: (text: React.ReactNode, title?: string) => Promise<string>;
  info: (text: React.ReactNode, title?: string) => Promise<string>;
  error: (text: React.ReactNode, title?: string) => Promise<string>;
  warn: (text: React.ReactNode, title?: string) => Promise<string>;
  success: (text: React.ReactNode, title?: string) => Promise<string>;
  __storybook: () => ComponentStoryBook;
};

type AlertContextValue = AlertController;

const AlertContext = React.createContext<AlertContextValue | null>(null);

let activeController: AlertController | null = null;

const variantIconMap: Record<
  ButtonVariant,
  React.ComponentType<{ className?: string }>
> = {
  default: QuestionMarkCircledIcon,
  primary: InfoCircledIcon,
  secondary: QuestionMarkCircledIcon,
  destructive: CrossCircledIcon,
  success: CheckCircledIcon,
  silt: ExclamationTriangleIcon,
};

const variantTextClassName: Record<ButtonVariant, string> = {
  default: "text-jade-text",
  primary: "text-jade-river",
  secondary: "text-jade-text",
  destructive: "text-jade-error",
  success: "text-jade-success",
  silt: "text-jade-silt",
};

const variantBorderClassName: Record<ButtonVariant, string> = {
  default: "border-jade-border-soft",
  primary: "border-jade-river/40",
  secondary: "border-jade-border-soft",
  destructive: "border-jade-error/40",
  success: "border-jade-success/40",
  silt: "border-jade-silt/40",
};

export const AlertProvider = ({ children }: React.PropsWithChildren) => {
  const [alerts, setAlerts] = React.useState<AlertState[]>([]);
  const sequenceRef = React.useRef(0);

  const destroy = React.useCallback((id: string) => {
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, closing: true } : alert,
      ),
    );

    window.setTimeout(() => {
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    }, 180);
  }, []);

  const create = React.useCallback(
    async (options: Partial<Props> = {}) => {
      return new Promise<string>((done, fail) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sequenceRef.current += 1;

        const onCancel = () => {
          options.onCancel?.();
          destroy(id);
          fail(`User dismissed the dialog. alert id = ${id}`);
        };

        const onAction = () => {
          options.onAction?.();
          destroy(id);
          done(id);
        };

        setAlerts((current) => [
          ...current,
          {
            id,
            z: sequenceRef.current,
            ...options,
            onAction,
            onCancel,
          },
        ]);

        return id;
      });
    },
    [destroy],
  );

  const confirm = React.useCallback(
    (text: React.ReactNode, title?: string) =>
      create({
        title: title ?? "Confirm",
        description: text,
        actionLabel: "Continue",
        cancelLabel: "Cancel",
        actionVariant: "primary",
        showCloseButton: false,
      }),
    [create],
  );

  const alert = React.useCallback(
    (text: React.ReactNode, title?: string) =>
      create({
        title: title ?? "Notice",
        description: text,
        actionLabel: "OK",
        actionVariant: "primary",
        showCloseButton: false,
      }),
    [create],
  );

  const info = React.useCallback(
    (text: React.ReactNode, title?: string) =>
      create({
        title: title ?? "Information",
        description: text,
        actionLabel: "OK",
        actionVariant: "primary",
        showCloseButton: false,
      }),
    [create],
  );

  const error = React.useCallback(
    (text: React.ReactNode, title?: string) =>
      create({
        title: title ?? "Error",
        description: text,
        actionLabel: "OK",
        actionVariant: "destructive",
        showCloseButton: false,
      }),
    [create],
  );

  const warn = React.useCallback(
    (text: React.ReactNode, title?: string) =>
      create({
        title: title ?? "Warning",
        description: text,
        actionLabel: "OK",
        actionVariant: "silt",
        showCloseButton: false,
      }),
    [create],
  );

  const success = React.useCallback(
    (text: React.ReactNode, title?: string) =>
      create({
        title: title ?? "Success",
        description: text,
        actionLabel: "OK",
        actionVariant: "success",
        showCloseButton: false,
      }),
    [create],
  );

  const contextValue = React.useMemo<AlertContextValue>(
    () => ({
      create,
      close: destroy,
      confirm,
      alert,
      info,
      error,
      warn,
      success,
    }),
    [destroy, confirm, create, alert, info, error, warn, success],
  );

  const stackContainerRef = useRef<HTMLDivElement>(null);

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
      <div
        ref={stackContainerRef}
        className="alerts-stack-container pointer-events-none fixed inset-0 z-9999"
      >
        {alerts.map((alert) => (
          <AlertBase
            portalTo={stackContainerRef.current}
            key={alert.id}
            {...alert}
            open
            zIndex={alert.z}
            closing={alert.closing}
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
  portalTo,
  showCloseButton = true,
  closing = false,
}: Props & {
  portalTo: HTMLDivElement;
  zIndex?: number;
  closing?: boolean;
}) => {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(!closing);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [closing]);

  const isControlled = open !== undefined;

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      onCancel?.();
    }
  };

  const IconComponent = variantIconMap[actionVariant ?? "primary"];
  const titleIconClassName = variantTextClassName[actionVariant ?? "primary"];
  const contentBorderClassName =
    variantBorderClassName[actionVariant ?? "primary"];

  return (
    <AlertDialog.Root
      open={isControlled ? open : undefined}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
    >
      {trigger ? (
        <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      ) : null}

      <AlertDialog.Portal container={portalTo}>
        <AlertDialog.Overlay
          className={clsx(
            "fixed inset-0 bg-jade-950/45 backdrop-blur-[2px] transition-opacity duration-200",
            isVisible && !closing ? "opacity-100" : "opacity-0",
          )}
          style={{ zIndex }}
        />
        <AlertDialog.Content
          className={clsx(
            "fixed left-1/2 top-1/2 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-jade-panel-raised p-5 text-jade-text shadow-[0_20px_60px_rgba(24,42,54,0.2)] transition-all duration-200 ease-out",
            contentBorderClassName,
            className,
            isVisible && !closing ? "opacity-100" : "opacity-0",
          )}
          style={{ zIndex }}
        >
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <AlertDialog.Title className="flex items-center gap-2 text-base font-semibold text-jade-text">
                <span className={clsx("shrink-0", titleIconClassName)}>
                  <IconComponent className="size-4" />
                </span>
                <span>{title}</span>
              </AlertDialog.Title>
              {description ? (
                <AlertDialog.Description className="mt-2 ml-6 text-sm text-jade-text-muted">
                  {description}
                </AlertDialog.Description>
              ) : null}
            </div>
            {showCloseButton ? (
              <AlertDialog.Cancel asChild>
                <IconButton
                  onClick={onCancel}
                  size="xs"
                  aria-label="Close dialog"
                >
                  <Cross2Icon />
                </IconButton>
              </AlertDialog.Cancel>
            ) : null}
          </div>

          {children ? <div className="mt-4">{children}</div> : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {cancelLabel && (
              <AlertDialog.Cancel asChild>
                <Button size="sm" variant="secondary" onClick={onCancel}>
                  {cancelLabel}
                </Button>
              </AlertDialog.Cancel>
            )}
            {actionLabel && (
              <AlertDialog.Action asChild>
                <Button size="sm" variant={actionVariant} onClick={onAction}>
                  {actionLabel}
                </Button>
              </AlertDialog.Action>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

export const Alert = AlertBase as AlertComponent;

Alert.create = async (options: Partial<Props> = {}) => {
  return (await activeController?.create(options)) ?? "";
};

Alert.confirm = async (text: React.ReactNode, title?: string) => {
  return (await activeController?.confirm(text, title)) ?? "";
};

Alert.alert = async (text: React.ReactNode, title?: string) => {
  return (await activeController?.alert(text, title)) ?? "";
};

Alert.info = async (text: React.ReactNode, title?: string) => {
  return (await activeController?.info(text, title)) ?? "";
};

Alert.error = async (text: React.ReactNode, title?: string) => {
  return (await activeController?.error(text, title)) ?? "";
};

Alert.warn = async (text: React.ReactNode, title?: string) => {
  return (await activeController?.warn(text, title)) ?? "";
};

Alert.success = async (text: React.ReactNode, title?: string) => {
  return (await activeController?.success(text, title)) ?? "";
};

Alert.__storybook = (): ComponentStoryBook => {
  return [
    {
      description:
        "Launch a tiny demo that opens an error alert when you click the text.",
      run: () => {
        return (
          <AlertProvider>
            <p
              className="cursor-pointer text-sm font-medium text-jade-text"
              onClick={async () => {
                await Alert.error(
                  "The toast tried to leave the room.",
                  "Oops, a tiny bug",
                );
                console.log("yes!");
              }}
            >
              Click me to summon a dramatic error.
            </p>
          </AlertProvider>
        );
      },
    },
    {
      description: "A calm informational message with a friendly blue accent.",
      props: {
        trigger: (
          <Button variant="primary" size="sm">
            Share view
          </Button>
        ),
        title: "A friendly little heads-up",
        description:
          "Your map is looking sharp today, and the river is behaving.",
        actionLabel: "Thanks",
      },
    },
    {
      description: "A warning that wears the orange caution hat.",
      props: {
        trigger: (
          <Button variant="secondary" size="sm">
            Check status
          </Button>
        ),
        actionVariant: "silt",
        title: "The weather is being dramatic",
        description: "The breeze is strong and the forecast may have opinions.",
        actionLabel: "Acknowledge",
      },
    },
    {
      description: "A success toast for victories both large and tiny.",
      props: {
        trigger: (
          <Button variant="success" size="sm">
            Celebrate
          </Button>
        ),
        actionVariant: "success",
        title: "Mission accomplished",
        description: "The selected river segment now has a victory ribbon.",
        actionLabel: "Party",
      },
    },
    {
      description:
        "A red alert for when the situation becomes a little too spicy.",
      props: {
        trigger: (
          <Button variant="destructive" size="sm">
            Trigger danger
          </Button>
        ),
        actionVariant: "destructive",
        title: "The alarm has gone full goblin",
        description:
          "Something important exploded, and the UI is not thrilled.",
        actionLabel: "Accept chaos",
      },
    },
    {
      description: "A confirmation flow with both continue and cancel choices.",
      props: {
        trigger: (
          <Button variant="primary" size="sm">
            Confirm action
          </Button>
        ),
        actionVariant: "primary",
        title: "Shall we continue this tiny adventure?",
        description: "A gentle confirmation with two buttons and zero drama.",
        actionLabel: "Continue",
        cancelLabel: "Cancel",
      },
    },
    {
      description: "A confirmation flow with both continue and cancel choices.",
      props: {
        trigger: (
          <Button variant="primary" size="sm">
            Ask politely
          </Button>
        ),
        actionVariant: "primary",
        title: "Shall we continue this tiny adventure?",
        description: "A gentle confirmation with two buttons and zero drama.",
        actionLabel: "Continue",
        cancelLabel: "Cancel",
      },
    },
    {
      description:
        "A gloriously overdramatic confirmation for when the stakes are suspiciously high.",
      run: () => {
        return (
          <AlertProvider>
            <p
              className="cursor-pointer text-sm font-medium text-jade-text"
              onClick={async () => {
                await Alert.confirm(
                  "This is the moment where the universe asks whether you are brave or just reckless.",
                  "A tiny but dramatic choice",
                );
                Alert.info("You survived the suspense. Impressive.");
              }}
            >
              Click here to test your courage.
            </p>
          </AlertProvider>
        );
      },
    },
  ];
};
