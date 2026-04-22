import { useCallback, useEffect, useRef, useState } from "react";

import type { NotificationEntry, ToastTone } from "../../shared/types/editor";

export function useToastNotifications() {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationEntries, setNotificationEntries] = useState<NotificationEntry[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "success"): void => {
    setToast({ message, tone });
    if (tone === "error") {
      setNotificationEntries((current) => [
        {
          id: `notification-${Date.now()}-${current.length}`,
          message,
          tone,
          createdAt: Date.now(),
        },
        ...current,
      ]);
    }
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);

  const openNotificationHistory = useCallback((): void => {
    setNotificationsOpen(true);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const closeNotificationHistory = useCallback((): void => {
    setNotificationsOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  return {
    toast,
    notificationsOpen,
    notificationEntries,
    showToast,
    openNotificationHistory,
    closeNotificationHistory,
  };
}
