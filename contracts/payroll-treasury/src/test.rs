#![cfg(test)]

use crate::{PayrollTreasury, PayrollTreasuryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, token};

#[test]
fn test_treasury_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let manager = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Register Treasury Contract
    let contract_id = env.register(PayrollTreasury, ());
    let client = PayrollTreasuryClient::new(&env, &contract_id);

    // 1. Initialize
    client.initialize(&admin, &manager);
    assert_eq!(client.get_admin().unwrap(), admin);
    assert_eq!(client.get_manager().unwrap(), manager);

    // Register a mock token
    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = sac.address();
    
    let token = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    // Mint some tokens to the admin for testing deposit
    let deposit_amount = 5000i128;
    token_admin_client.mint(&admin, &deposit_amount);
    assert_eq!(token.balance(&admin), deposit_amount);

    // 2. Deposit funds to Treasury
    client.deposit(&admin, &deposit_amount, &token_id);
    assert_eq!(token.balance(&contract_id), deposit_amount);
    assert_eq!(token.balance(&admin), 0);
    assert_eq!(client.get_total_deposited(&token_id), deposit_amount);

    // 3. Disburse funds to recipient (requires manager auth)
    let disburse_amount = 2000i128;
    client.disburse(&recipient, &disburse_amount, &token_id);
    assert_eq!(token.balance(&contract_id), deposit_amount - disburse_amount);
    assert_eq!(token.balance(&recipient), disburse_amount);
    assert_eq!(client.get_total_disbursed(&token_id), disburse_amount);

    // 4. Admin withdraws the remaining funds
    let withdraw_amount = 1000i128;
    client.withdraw(&admin, &withdraw_amount, &token_id);
    assert_eq!(token.balance(&contract_id), deposit_amount - disburse_amount - withdraw_amount);
    assert_eq!(token.balance(&admin), withdraw_amount);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_double_initialization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let manager = Address::generate(&env);

    let contract_id = env.register(PayrollTreasury, ());
    let client = PayrollTreasuryClient::new(&env, &contract_id);

    client.initialize(&admin, &manager);
    client.initialize(&admin, &manager); // Should panic
}
