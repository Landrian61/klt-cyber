import { createContext, useContext, useState, useCallback } from 'react';

export interface RegistrationData {
  // Step 1 — Personal Bio
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: Date | null;
  sex: 'Male' | 'Female' | null;
  maritalStatus: 'Single' | 'Married' | 'Widowed' | 'Divorced' | null;

  // Step 2 — Church Profile
  clan: string;
  departments: string[];
  mentorshipStatus: 'not_enrolled' | 'undergoing' | 'completed';
  hasChildren: boolean;
  children: Array<{ firstName: string; dateOfBirth: Date | null }>;
  spouseName: string;

  // Step 3 — Optional Details
  profession: string;
  jobTitle: string;
  workplace: string;
  showProfessionalOnProfile: boolean;
  leadershipInstituteLevel: 'not_enrolled' | 'level_1' | 'level_2' | 'advanced';
}

const initialData: RegistrationData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  dateOfBirth: null,
  sex: 'Male',
  maritalStatus: null,

  clan: '',
  departments: [],
  mentorshipStatus: 'not_enrolled',
  hasChildren: false,
  children: [],
  spouseName: '',

  profession: '',
  jobTitle: '',
  workplace: '',
  showProfessionalOnProfile: false,
  leadershipInstituteLevel: 'not_enrolled',
};

interface RegistrationContextValue {
  data: RegistrationData;
  updateData: (updates: Partial<RegistrationData>) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<RegistrationData>(initialData);

  const updateData = useCallback((updates: Partial<RegistrationData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => {
    setData(initialData);
  }, []);

  return (
    <RegistrationContext.Provider value={{ data, updateData, reset }}>
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration(): RegistrationContextValue {
  const context = useContext(RegistrationContext);
  if (!context) {
    throw new Error('useRegistration must be used within a RegistrationProvider');
  }
  return context;
}
