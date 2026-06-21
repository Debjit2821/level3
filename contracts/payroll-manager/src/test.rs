 #![cfg(test)]

use crate::{PayrollManager, PayrollManagerClient, Employee};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String, token,
};

// Import Treasury Contract to deploy it during Manager's C2C integration tests
mod treasury {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32v1-none/release/payroll_treasury.wasm"
    );
}

#[test]
fn test_payroll_manager_success_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    
    // Register the Treasury contract (using compiled WASM)
    let treasury_id = env.register_contract_wasm(None, treasury::WASM);
    let treasury_client = treasury::Client::new(&env, &treasury_id);

    // Register the Manager contract
    let manager_id = env.register(PayrollManager, ());
    let manager_client = PayrollManagerClient::new(&env, &manager_id);

    // Initialize Treasury
    treasury_client.initialize(&admin, &manager_id);

    // Register a mock token
    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = sac.address();
    
    let token = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    // Initialize Manager
    manager_client.initialize(&admin, &treasury_id, &token_id);

    // Fund the Treasury
    let fund_amount = 10000i128;
    token_admin_client.mint(&admin, &fund_amount);
    treasury_client.deposit(&admin, &fund_amount, &token_id);
    assert_eq!(token.balance(&treasury_id), fund_amount);

    // Add Employee
    let employee = Address::generate(&env);
    let salary = 1500i128;
    let frequency = 86400u64; // 1 day
    let role = String::from_str(&env, "Senior Frontend Engineer");

    manager_client.add_employee(&employee, &salary, &frequency, &role);
    assert_eq!(manager_client.get_employees_count(), 1);

    // Verify employee data
    let emp = manager_client.get_employee(&employee).unwrap();
    assert_eq!(emp.salary, salary);
    assert_eq!(emp.pay_frequency, frequency);
    assert_eq!(emp.active, true);
    assert_eq!(emp.last_paid_at, 0);

    // 1. First claim is immediately eligible since next_payout_time is initialised to added timestamp
    manager_client.claim_payroll(&employee);
    assert_eq!(token.balance(&employee), salary);
    assert_eq!(token.balance(&treasury_id), fund_amount - salary);

    // Verify next payout time is advanced
    let emp_updated = manager_client.get_employee(&employee).unwrap();
    assert_eq!(emp_updated.last_paid_at, env.ledger().timestamp());
    assert_eq!(emp_updated.next_payout_time, env.ledger().timestamp() + frequency);

    // 2. Advance ledger time by 1 day to make next payout eligible
    env.ledger().set_timestamp(env.ledger().timestamp() + frequency + 10);
    manager_client.claim_payroll(&employee);
    assert_eq!(token.balance(&employee), salary * 2);
    assert_eq!(token.balance(&treasury_id), fund_amount - (salary * 2));
}

#[test]
#[should_panic(expected = "Payroll not eligible yet")]
fn test_claim_too_early() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury_id = env.register_contract_wasm(None, treasury::WASM);
    let treasury_client = treasury::Client::new(&env, &treasury_id);
    let manager_id = env.register(PayrollManager, ());
    let manager_client = PayrollManagerClient::new(&env, &manager_id);
    
    // Register mock token
    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = sac.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    treasury_client.initialize(&admin, &manager_id);
    manager_client.initialize(&admin, &treasury_id, &token_id);

    // Fund Treasury
    token_admin_client.mint(&admin, &5000i128);
    treasury_client.deposit(&admin, &5000i128, &token_id);

    // Add Employee
    let employee = Address::generate(&env);
    let salary = 1000i128;
    let frequency = 86400u64; // 1 day
    let role = String::from_str(&env, "Rust Dev");
    manager_client.add_employee(&employee, &salary, &frequency, &role);

    // First claim succeeds
    manager_client.claim_payroll(&employee);

    // Attempting a second claim immediately should panic/fail
    manager_client.claim_payroll(&employee);
}

#[test]
#[should_panic(expected = "Employee is inactive")]
fn test_terminated_employee_claim() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury_id = env.register_contract_wasm(None, treasury::WASM);
    let treasury_client = treasury::Client::new(&env, &treasury_id);
    let manager_id = env.register(PayrollManager, ());
    let manager_client = PayrollManagerClient::new(&env, &manager_id);
    
    // Register mock token
    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = sac.address();

    treasury_client.initialize(&admin, &manager_id);
    manager_client.initialize(&admin, &treasury_id, &token_id);

    // Add Employee
    let employee = Address::generate(&env);
    let salary = 1000i128;
    let frequency = 86400u64;
    let role = String::from_str(&env, "Rust Dev");
    manager_client.add_employee(&employee, &salary, &frequency, &role);

    // Terminate employee
    manager_client.terminate_employee(&employee);

    let emp = manager_client.get_employee(&employee).unwrap();
    assert_eq!(emp.active, false);

    // Attempting to claim should panic
    manager_client.claim_payroll(&employee);
}
