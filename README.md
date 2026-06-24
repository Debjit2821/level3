# StellarPay: Decentralized Payroll & Treasury Vault Console

StellarPay is a decentralized payroll, employee management, and treasury vault DApp powered by **Soroban Smart Contracts**, **Next.js 15**, and **StellarWalletsKit**. 

This DApp enables organizations to register employees, allocate working capital into a dedicated treasury vault, and release time-locked salary claims. Employees claim their salaries directly to their wallets once their payout intervals elapse.

---

## 🔗 Project Links

* **GitHub Repository**: [Debjit2821/level3](https://github.com/Debjit2821/level3)
* **Live Demo**: [StellarPay Production App](https://level3-rosy.vercel.app/)
* **Demo Video**:[DEMO](https://youtu.be/6w7dN0blc9I)

---

## 📸 Screenshots & Proof of Architecture

### 1. Landing Portal
*StellarPay landing interface displaying organizational tools, live statistics, and secure wallet connectivity.*
![Landing Portal](public/screenshots/landing_page.png)

### 2. Dashboard & Platform Analytics
*User dashboard displaying active payroll details, employee registry, treasury statistics, and historical logs.*
![Dashboard Analytics](public/screenshots/dashboard.png)

### 3. Stellar Expert Explorer
*On-chain verification showing smart contract transaction trace, event logs, and status updates on the Stellar Testnet.*
![Stellar Explorer](public/screenshots/explorer.png)

### 4. Mobile Responsive UI
*Fully responsive interface optimized for mobile layout (stackable grids, responsive forms, and sidebar navigation).*
![Mobile Responsive UI](public/screenshots/mobile.png)


### 5. Wallet Options
*StellarWalletsKit integration offering multiple wallet connection methods (Freighter, Albedo, Hana, xBull).*
![Wallet Options](public/wallet_modal.png)
### 6. CI/CD Pipeline Verification
![ci/cd](public/screenshots/Screenshot%202026-06-24%20151656.png)
### 7.Test Output :
 *Test output with 3+ passing tests*
 ![test output]()

---

## ⛓ Deployed Addresses (Stellar Testnet)

* **Payroll Manager Contract Address**: `CCZT6V2SXFK53U7EPZCERT54CBGJVJHYJKOCNWZWGR7FE4UWLUHBQYHM` (referred to as `MANAGER_CONTRACT` in config)
* **Payroll Treasury Contract Address**: `CBHJ63OISWUYB6VR7EQ3X3BFNFZTJNUFSG5S24TWYOQ57CGIHHWABEJ5` (referred to as `TREASURY_CONTRACT` in config)
* **XLM SAC Token Address**: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (referred to as `TOKEN_CONTRACT` in config)
* **Deployer Address**: `GDT37UGSKAIKDUGC73VHAI6HASL27O5YTCHONKRIIH7AJBMBIQPWRVX3`
* **Example Contract Deployment Tx**: `6ea068469b358580aae15247b18113f997c7ae9bf6c33212c3749e42fc196084` (referred to as `TRANSACTION_HASH_HERE` in config)
* **Explorer Link**: [Stellar Expert Explorer](https://stellar.expert/explorer/testnet/tx/6ea068469b358580aae15247b18113f997c7ae9bf6c33212c3749e42fc196084)

---

## 🔑 Authentication Architecture

StellarPay uses **Stellar Wallet Addresses (Wallet ID)** as the primary key for authentication and login.

```
[Stellar Wallet]
  ( Freighter / Albedo / xBull )
       │
       ▼  (connectWallet() via StellarWalletsKit)
 [Stellar Address]  ──► (Primary Key)
       │
       ▼  (Zustand store: setAddress())
 [isConnected: true]
       │
       ├─► LocalStorage Sync (persists session)
       ▼
 [Dashboard & Control Panels]
       │
       ├─► Connected: Render Admin Console, Employee Console, & Event Stream
       └─► Disconnected: Show "Connect Wallet" Prompt
```

1. **Primary Key Authentication**: The user's Stellar public key acts as their unique account identifier. The DApp does not require traditional email/password credentials.
2. **Session Persistence**: Once connected, the user's wallet address is stored in `localStorage` under the key `stellar_connected_address` and managed globally via the Zustand state store (`hooks/use-payroll-store.ts`). This ensures the connection state persists through page reloads.
3. **Interactive Control Panels**: Client-side pages are reactive. When the wallet is connected, the UI shows relevant details (such as wallet address, network, balance) and enables the actions forms (add employee, disburse, claim payroll). If disconnected, it prompts for connection.
4. **Log Out**: Clicking the wallet button and selecting "Disconnect" clears both the Zustand store memory and `localStorage` session keys.

---

## 📜 Soroban Smart Contract Specifications

### File Location: [`contracts/payroll-manager/src/lib.rs`](./contracts/payroll-manager/src/lib.rs) & [`contracts/payroll-treasury/src/lib.rs`](./contracts/payroll-treasury/src/lib.rs)

### 1. Data Structures & Types
The contracts store state entries using Soroban's instance and persistent storage.

```rust
// Storage Keys (Payroll Manager)
pub enum DataKey {
    Admin,              // Instance storage: address of contract admin
    Treasury,           // Instance storage: address of the payroll treasury contract
    Token,              // Instance storage: address of the default payment token (XLM SAC)
    EmployeesList,      // Persistent storage: Vec of employee addresses
    Employee(Address),  // Persistent storage: maps employee address to Employee struct
}

// Employee Struct (Payroll Manager)
pub struct Employee {
    pub address: Address,      // Account address of the employee
    pub salary: i128,          // Salary amount per payout cycle
    pub pay_frequency: u64,    // Payout cycle interval in seconds
    pub next_payout_time: u64, // Unix timestamp in seconds for next payout eligibility
    pub role: String,          // Role / job title of the employee
    pub active: bool,          // Whether the employee is currently active
    pub last_paid_at: u64,     // Unix timestamp of the last payout
}

// Storage Keys (Payroll Treasury)
pub enum DataKey {
    Admin,                    // Instance storage: address of treasury admin
    Manager,                  // Instance storage: address of the payroll manager contract
    TotalDeposited(Address),  // Instance storage: total deposited amount per token address
    TotalDisbursed(Address),  // Instance storage: total disbursed amount per token address
}
```

### 2. Contract Interfaces (Functions)

#### Payroll Manager Contract
* **`initialize(env: Env, admin: Address, treasury: Address, token: Address)`**: Sets up the payroll manager contract. Can only be invoked once.
* **`add_employee(env: Env, employee: Address, salary: i128, pay_frequency: u64, role: String)`**: Allows the admin to register a new employee. Emits event `emp_added`.
* **`update_employee(env: Env, employee: Address, salary: i128, pay_frequency: u64, role: String)`**: Allows the admin to update details of an existing employee. Emits event `emp_updated`.
* **`terminate_employee(env: Env, employee: Address)`**: Allows the admin to terminate an employee (marks inactive). Emits event `emp_terminated`.
* **`claim_payroll(env: Env, employee: Address)`**: Allows an active employee to claim their salary once the payment frequency has elapsed. Calls linked treasury contract. Emits event `payroll_claimed`.
* **`update_treasury(env: Env, new_treasury: Address)`**: Allows the admin to change the linked treasury address.
* **`update_admin(env: Env, new_admin: Address)`**: Allows the admin to transfer contract ownership to a new administrator.
* **`get_employee(env: Env, employee: Address) -> Option<Employee>`**: Queries details for a registered employee.
* **`get_employees(env: Env) -> Vec<Address>`**: Queries a list of all registered employee addresses.

#### Payroll Treasury Contract
* **`initialize(env: Env, admin: Address, manager: Address)`**: Sets up the payroll treasury contract. Can only be invoked once.
* **`disburse(env: Env, to: Address, amount: i128, token: Address)`**: Triggers token disbursement from the treasury to an employee. Restricted to the authorized manager contract. Emits event `disbursed`.
* **`deposit(env: Env, from: Address, amount: i128, token: Address)`**: Records deposit to the treasury. Transfers tokens from sender to treasury. Emits event `deposited`.
* **`withdraw(env: Env, to: Address, amount: i128, token: Address)`**: Allows the admin to withdraw tokens from the treasury vault. Emits event `withdrawn`.
* **`update_manager(env: Env, new_manager: Address)`**: Allows the admin to update the authorized payroll manager address.
* **`update_admin(env: Env, new_admin: Address)`**: Allows the admin to transfer treasury vault ownership.

---

## 🚀 User Proof of Concept (PoC) Walkthrough

Follow this step-by-step test scenario to experience the DApp's core payroll lifecycle on the Stellar Testnet.

```
       AUTHENTICATE              DEPOSIT FUNDS              ADD EMPLOYEE
┌────────────────────────┐  ┌───────────────────┐  ┌────────────────────┐
│ 1. Connect wallet      │─►│ 2. Fund treasury  │─►│ 3. Register payee  │
│    and sign in session │  │    vault with XLM │  │    salary details  │
└────────────────────────┘  └───────────────────┘  └────────────────────┘
                                                             │
                                                             ▼
         COMPLETED                 CLAIM SALARY             VERIFICATION
┌────────────────────────┐  ┌───────────────────┐  ┌────────────────────┐
│ 6. Verify payout state  │◄─│ 5. Employee claims │◄─│ 4. Track events on │
│    & on-chain history  │  │    available salary │  │    active streams  │
└────────────────────────┘  └───────────────────┘  └────────────────────┘
```

### Step 1: Wallet Authentication
1. Install [Freighter Wallet](https://www.freighter.app/) extension and switch network to **Testnet**.
2. Go to the StellarPay landing page (`http://localhost:3000`).
3. Click **Access Operator Console** or **Connect Wallet** and select Freighter. Approve the connection.
4. Once authenticated, your session is established, and the interactive panels unlock.

### Step 2: Deposit Treasury Vault Funding
1. Before employees can claim salaries, the Treasury vault must contain sufficient XLM tokens.
2. In the **Admin Console** panel under the "Deposit Vault" card, enter the deposit amount (e.g., `1000 XLM`).
3. Click **Deposit Funds** and confirm the transaction in Freighter. This transfers XLM from the admin account directly to the `payroll-treasury` contract.
4. Verify that the **Vault Balance** updates dynamically to reflect the new total.

### Step 3: Register an Employee
1. In the **Admin Console** under the "Register Employee" card, fill out the employee details:
   - **Employee Address**: The recipient's public key (e.g., your own address for testing).
   - **Salary (XLM)**: E.g., `100 XLM`
   - **Pay Frequency**: Choose a time duration (e.g., `1 Minute` for testing/demo or custom hours/days).
   - **Role / Job Title**: E.g., `Senior Rust Developer`
2. Click **Register Employee** and sign the transaction in Freighter.
3. Verify that the employee appears in the "Registered Employees Directory" showing the status **Active** and eligibility is marked as **Eligible Now**.

### Step 4: Track Events and Logs
1. Look at the **Activity Feed** panel.
2. Verify that the `emp_added` event is displayed in real-time.
3. Check the **Transaction Center** to monitor the transaction status (`pending` -> `success`).

### Step 5: Claim Salary
1. Switch your view to the **Employee Console** tab.
2. Find the employee profile in the listing (if you used your connected wallet address).
3. If the payment frequency duration has passed (or immediately if newly registered), you will see **Eligible** next to your profile.
4. Click **Claim Salary** and sign the transaction in Freighter.
5. Verify that:
   - The employee's individual balance increases by `100 XLM`.
   - The Vault Balance decreases by `100 XLM`.
   - The employee's `last_paid_at` updates to the current block time, and `next_payout_time` updates dynamically according to the frequency.

### Step 6: Settle & Complete Payout verification
1. Observe the **Activity Feed** to confirm the `payroll_claimed` event was successfully emitted by the contract and processed by the client.
2. Confirm the payout txn trace is correctly recorded on the Stellar Testnet ledger.

---

## 🛠 Setup & Run Instructions

### Prerequisites
* [Node.js](https://nodejs.org) (v18+)
* [Rust & Cargo](https://rustup.rs/)
* [Stellar CLI](https://developers.stellar.org/docs/tools/cli)

### 1. Install Dependencies
```bash
git clone https://github.com/Debjit2821/level3.git
cd level3
npm install --ignore-scripts
```

### 2. Compile & Test Smart Contract
```bash
# Set Path variables on Windows environment if required
$env:PATH="C:\Users\debji\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained;$env:PATH"

# Run tests
cargo test --offline
```

### 3. Run Locally
Start the Next.js development server:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 4. Build Production Target
```bash
npm run build
```

### 5. Contract Deployment
To compile contracts, create a deployer keypair, fund it, deploy the contract WASMs, and initialize them, run:
```bash
node scripts/deploy.js
```
