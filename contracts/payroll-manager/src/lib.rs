#![no_std]
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    String, Symbol, Vec,
};

#[contractclient(name = "TreasuryClient")]
pub trait Treasury {
    fn disburse(env: Env, to: Address, amount: i128, token: Address);
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Employee {
    pub address: Address,
    pub salary: i128,
    pub pay_frequency: u64, // time frequency in seconds (e.g. 2592000 for 30 days)
    pub next_payout_time: u64, // timestamp when they are next eligible
    pub role: String,
    pub active: bool,
    pub last_paid_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    Token,
    EmployeesList,      // Vec<Address>
    Employee(Address),
}

#[contract]
pub struct PayrollManager;

#[contractimpl]
impl PayrollManager {
    /// Initializes the payroll manager with admin, treasury vault, and default payout token contract.
    pub fn initialize(env: Env, admin: Address, treasury: Address, token: Address) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "Already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::Token, &token);
        
        let empty_list: Vec<Address> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::EmployeesList, &empty_list);

        env.events().publish(
            (symbol_short!("p_init"), admin, treasury),
            token,
        );
    }

    /// Adds an employee. Restricted to admin.
    pub fn add_employee(
        env: Env,
        employee: Address,
        salary: i128,
        pay_frequency: u64,
        role: String,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(salary > 0, "Salary must be positive");
        assert!(pay_frequency > 0, "Frequency must be positive");

        let key = DataKey::Employee(employee.clone());
        assert!(
            !env.storage().persistent().has(&key),
            "Employee already exists"
        );

        let now = env.ledger().timestamp();
        let new_emp = Employee {
            address: employee.clone(),
            salary,
            pay_frequency,
            next_payout_time: now, // eligible immediately on add
            role: role.clone(),
            active: true,
            last_paid_at: 0,
        };

        env.storage().persistent().set(&key, &new_emp);

        // Update list of all employees
        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::EmployeesList)
            .unwrap_or_else(|| Vec::new(&env));
        list.push_back(employee.clone());
        env.storage().persistent().set(&DataKey::EmployeesList, &list);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "emp_added"), employee, salary),
            role,
        );
    }

    /// Updates employee configuration (salary, frequency, role). Restricted to admin.
    pub fn update_employee(
        env: Env,
        employee: Address,
        salary: i128,
        pay_frequency: u64,
        role: String,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(salary > 0, "Salary must be positive");
        assert!(pay_frequency > 0, "Frequency must be positive");

        let key = DataKey::Employee(employee.clone());
        let mut emp: Employee = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Employee does not exist");

        emp.salary = salary;
        emp.pay_frequency = pay_frequency;
        emp.role = role.clone();

        env.storage().persistent().set(&key, &emp);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "emp_updated"), employee, salary),
            role,
        );
    }

    /// Terminates an employee. Sets status to inactive. Restricted to admin.
    pub fn terminate_employee(env: Env, employee: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let key = DataKey::Employee(employee.clone());
        let mut emp: Employee = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Employee does not exist");

        assert!(emp.active, "Employee is already inactive");
        emp.active = false;
        env.storage().persistent().set(&key, &emp);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "emp_terminated"), employee),
            env.ledger().timestamp(),
        );
    }

    /// Triggers payroll disbursement. Can be called by the employee or a manager.
    /// Requires employee active and current ledger time >= next_payout_time.
    pub fn claim_payroll(env: Env, employee: Address) {
        let key = DataKey::Employee(employee.clone());
        let mut emp: Employee = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Employee does not exist");

        assert!(emp.active, "Employee is inactive");
        
        let now = env.ledger().timestamp();
        assert!(
            now >= emp.next_payout_time,
            "Payroll not eligible yet"
        );

        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::Treasury)
            .expect("Treasury not set");
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("Token not set");

        // 1. Call the Treasury contract to disburse the tokens
        let treasury_client = TreasuryClient::new(&env, &treasury);
        treasury_client.disburse(&employee, &emp.salary, &token);

        // 2. Update employee payment milestones
        emp.last_paid_at = now;
        emp.next_payout_time = now + emp.pay_frequency;
        env.storage().persistent().set(&key, &emp);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "payroll_claimed"), employee, emp.salary),
            now,
        );
    }

    /// Updates the linked treasury address. Restricted to admin.
    pub fn update_treasury(env: Env, new_treasury: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Treasury, &new_treasury);

        env.events().publish(
            (symbol_short!("upd_trsy"), new_treasury),
            env.ledger().timestamp(),
        );
    }

    /// Updates the admin of the manager contract. Restricted to admin.
    pub fn update_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);

        env.events().publish(
            (symbol_short!("upd_admin"), new_admin),
            env.ledger().timestamp(),
        );
    }

    /// Upgrades the contract WASM bytecode. Restricted to admin.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Read single employee details.
    pub fn get_employee(env: Env, employee: Address) -> Option<Employee> {
        let key = DataKey::Employee(employee);
        env.storage().persistent().get(&key)
    }

    /// Read list of all employee addresses.
    pub fn get_employees(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::EmployeesList)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Read total number of employees registered.
    pub fn get_employees_count(env: Env) -> u32 {
        let list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::EmployeesList)
            .unwrap_or_else(|| Vec::new(&env));
        list.len()
    }
}

#[cfg(test)]
mod test;
