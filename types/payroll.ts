export interface Employee {
  address: string;
  salary: number; // in standard token units (stroops divided by 10^7)
  payFrequency: number; // seconds
  nextPayoutTime: number; // timestamp seconds
  role: string;
  active: boolean;
  lastPaidAt: number; // timestamp seconds
}

export interface ActivityEvent {
  id: string;
  type: 
    | "employee_added" 
    | "employee_updated" 
    | "employee_terminated" 
    | "payroll_paid" 
    | "treasury_deposit" 
    | "treasury_withdraw" 
    | "unknown";
  actor: string;
  employee?: string;
  amount?: number;
  timestamp: number;
  details?: string;
}

export interface TxTracker {
  hash: string;
  title: string;
  status: "pending" | "processing" | "success" | "failed";
  timestamp: number;
  contract?: string;
}
