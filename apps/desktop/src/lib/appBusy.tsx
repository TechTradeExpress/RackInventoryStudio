import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface BusyState {
  isBusy: boolean;
  label: string;
}

interface AppBusyContextValue {
  isBusy: boolean;
  label: string;
  runBusy: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
}

const defaultValue: AppBusyContextValue = {
  isBusy: false,
  label: "",
  runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
};

const AppBusyContext = createContext<AppBusyContextValue>(defaultValue);

export function AppBusyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BusyState>({ isBusy: false, label: "" });

  const runBusy = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    setState({ isBusy: true, label });
    // Yield one tick so React can render the overlay before the operation starts.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    try {
      return await fn();
    } finally {
      setState({ isBusy: false, label: "" });
    }
  }, []);

  const value = useMemo<AppBusyContextValue>(
    () => ({ isBusy: state.isBusy, label: state.label, runBusy }),
    [state.isBusy, state.label, runBusy],
  );

  return <AppBusyContext.Provider value={value}>{children}</AppBusyContext.Provider>;
}

export function useBusy(): AppBusyContextValue {
  return useContext(AppBusyContext);
}
