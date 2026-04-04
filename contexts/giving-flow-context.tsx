import { createContext, useContext, useState, useCallback } from 'react';

export interface GivingFlowData {
  categories: string[];
  amount: number;
  paymentMethod: 'mobile_money' | 'card' | 'bank_transfer' | null;
  phoneNumber: string;
  isAnonymous: boolean;
  isRecurring: boolean;
  recurringFrequency: 'weekly' | 'monthly' | 'annually';
}

const initialData: GivingFlowData = {
  categories: [],
  amount: 0,
  paymentMethod: null,
  phoneNumber: '',
  isAnonymous: false,
  isRecurring: false,
  recurringFrequency: 'monthly',
};

interface GivingFlowContextValue {
  data: GivingFlowData;
  updateData: (updates: Partial<GivingFlowData>) => void;
  reset: () => void;
}

const GivingFlowContext = createContext<GivingFlowContextValue | null>(null);

export function GivingFlowProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<GivingFlowData>(initialData);

  const updateData = useCallback((updates: Partial<GivingFlowData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => {
    setData(initialData);
  }, []);

  return (
    <GivingFlowContext.Provider value={{ data, updateData, reset }}>
      {children}
    </GivingFlowContext.Provider>
  );
}

export function useGivingFlow(): GivingFlowContextValue {
  const context = useContext(GivingFlowContext);
  if (!context) {
    throw new Error('useGivingFlow must be used within a GivingFlowProvider');
  }
  return context;
}
