"use client";

import { createContext, useContext } from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

const OnlineCtx = createContext(true);
export const useOnline = () => useContext(OnlineCtx);

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const online = useOnlineStatus();
  return (
    <OnlineCtx.Provider value={online}>
      {!online && (
        <div role="alert" className="no-print sticky top-0 z-50 flex items-center justify-center gap-2 bg-danger px-4 py-2 text-sm font-medium text-white">
          <WifiOff className="size-4" /> Connexion perdue — les enregistrements sont désactivés jusqu&apos;au retour du réseau.
        </div>
      )}
      {children}
    </OnlineCtx.Provider>
  );
}
