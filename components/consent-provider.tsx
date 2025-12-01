"use client";

import { ConsentDialog } from "@/components/consent-dialog";
import { createContext, ReactNode, useContext, useState } from "react";

interface ConsentContextType {
  hasConsented: boolean | null;
  setConsent: (consented: boolean) => void;
}

const ConsentContext = createContext<ConsentContextType>({
  hasConsented: null,
  setConsent: () => {},
});

export const useConsent = () => useContext(ConsentContext);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [hasConsented, setHasConsented] = useState<boolean | null>(null);

  const handleConsent = (consented: boolean) => {
    setHasConsented(consented);
  };

  return (
    <ConsentContext.Provider
      value={{ hasConsented, setConsent: setHasConsented }}
    >
      <ConsentDialog onConsent={handleConsent} />
      {children}
    </ConsentContext.Provider>
  );
}
