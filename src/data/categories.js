/**
 * Accounting task taxonomy — DO NOT rename, remove, merge, or reorder any
 * category or task here. This is a verbatim port of the user's real
 * monthly close workflow. Only touch this file if the user's actual
 * accounting process changes.
 */

export const CATEGORIES = [
  { id: "payroll", name: "Payroll", tasks: [
    { id: "payroll-loan-deduction", name: "Loan Deduction" },
    { id: "payroll-other-deduction", name: "Other Deduction" },
    { id: "payroll-adjustment", name: "Adjustment" },
    { id: "payroll-salaries", name: "Salaries" },
    { id: "payroll-overtime", name: "Overtime" },
    { id: "payroll-remote-area", name: "Remote Area" },
  ]},
  { id: "employee-expenses", name: "Employee Expenses", tasks: [
    { id: "end-of-service", name: "End Of Service" },
    { id: "employee-ticket", name: "Employee Ticket" },
    { id: "employee-expenses-misc", name: "Employee Expenses" },
  ]},
  { id: "prepaid-expenses", name: "Prepaid Expenses", tasks: [
    { id: "prepaid-rent", name: "Rent" },
    { id: "prepaid-iqama", name: "Iqama" },
    { id: "prepaid-insurance", name: "Insurance" },
    { id: "prepaid-contract", name: "Contract" },
    { id: "prepaid-machines", name: "Machines" },
  ]},
  { id: "doctors", name: "Doctor's Share", tasks: [
    { id: "doctor-sukainah", name: "Dr. Sukainah Taha Alfaraj" },
    { id: "doctor-naif", name: "Dr. Naif Abdulghani Al Dubais" },
    { id: "conducted-doctors", name: "Conducted Doctors" },
    { id: "beginning-of-month", name: "Beginning of the Month" },
    { id: "mid-of-month", name: "Mid of the Month" },
  ]},
  { id: "machine-maintenance", name: "Machine Maintenance", tasks: [
    { id: "machine-1", name: "Machine 1" },
    { id: "machine-2", name: "Machine 2" },
    { id: "machine-3", name: "Machine 3" },
  ]},
  { id: "payroll-costs", name: "Incentives & GOSI", tasks: [
    { id: "incentives", name: "Incentives" },
    { id: "gosi", name: "GOSI" },
  ]},
  { id: "facilities", name: "Facilities & Services", tasks: [
    { id: "security", name: "Security" },
    { id: "lab", name: "Lab" },
    { id: "medical-hygiene", name: "Medical Hygiene" },
    { id: "rented-procare", name: "Rented Facilities - Procare" },
    { id: "rented-dar-afia", name: "Rented Facilities - Dar Afia" },
    { id: "laundry", name: "Laundry" },
    { id: "electricity", name: "Electricity" },
    { id: "marketing", name: "Marketing" },
  ]},
  { id: "finance-assets", name: "Finance & Assets", tasks: [
    { id: "assets-depreciation", name: "Assets Depreciation" },
    { id: "bank-charges", name: "Bank Charges" },
    { id: "loan-deductions-gl", name: "Loan Deductions" },
  ]},
  { id: "cash", name: "Cash & Petty Cash", tasks: [
    { id: "petty-cash", name: "Petty Cash" },
    { id: "petty-cash-expenses", name: "Petty Cash (Expenses)" },
  ]},
  { id: "credit-card", name: "Credit Card", tasks: [
    { id: "credit-card", name: "Credit Card" },
    { id: "credit-card-reimbursement", name: "Credit Card Reimbursement" },
  ]},
  { id: "ledger-items", name: "Ledger Items", tasks: [
    { id: "deposits", name: "Deposits" },
    { id: "reversals-credit-notes", name: "Reversals / Credit Notes" },
    { id: "grants", name: "Grants" },
    { id: "suspense-account", name: "Suspense Account" },
  ]},
  { id: "payment-methods", name: "Payment Methods", tasks: [
    { id: "tabby", name: "Tabby" },
    { id: "tamara", name: "Tamara" },
    { id: "website", name: "Website" },
    { id: "cash-pm", name: "Cash" },
    { id: "cash-reimbursement", name: "Cash (Reimbursement)" },
    { id: "snb", name: "SNB" },
    { id: "riyadh-bank", name: "Riyadh Bank" },
  ]},
  { id: "verification", name: "Verification & Compliance", tasks: [
    { id: "counter-receipt", name: "Counter Receipt" },
    { id: "no-missing-bills", name: "No Missing Bills" },
    { id: "scans", name: "Scans" },
  ]},
];

export const CATEGORY_ICONS = {
  payroll: "wallet",
  "employee-expenses": "hourglass",
  "prepaid-expenses": "receipt",
  doctors: "stethoscope",
  "machine-maintenance": "wrench",
  "payroll-costs": "award",
  facilities: "building-2",
  "finance-assets": "trending-up",
  cash: "banknote",
  "credit-card": "credit-card",
  "ledger-items": "book-open",
  "payment-methods": "circle-dollar-sign",
  verification: "shield-check",
};

export const STATUS_META = {
  pending: { label: "Pending", tone: "rust", icon: "circle" },
  "in-progress": { label: "In Progress", tone: "amber", icon: "circle-dot" },
  done: { label: "Reconciled", tone: "green", icon: "circle-check" },
};

export const MIG_STATUS_META = {
  pending: { label: "Pending", tone: "rust", icon: "circle" },
  "in-progress": { label: "In Progress", tone: "amber", icon: "circle-dot" },
  done: { label: "Done", tone: "green", icon: "circle-check" },
};

export const ALL_TASKS = CATEGORIES.flatMap((c) =>
  c.tasks.map((t) => ({ ...t, categoryId: c.id, categoryName: c.name }))
);
export const TASK_BY_ID = Object.fromEntries(ALL_TASKS.map((t) => [t.id, t]));
