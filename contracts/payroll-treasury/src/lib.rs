#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol, IntoVal,
};
use soroban_sdk::auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation};

#[contracttype]
pub enum DataKey {
    Admin,
    Manager,
    TotalDeposited(Address),
    TotalDisbursed(Address),
}

#[contract]
pub struct PayrollTreasury;

#[contractimpl]
impl PayrollTreasury {
    /// Initializes the treasury with an admin and the allowed manager address.
    pub fn initialize(env: Env, admin: Address, manager: Address) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "Already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Manager, &manager);

        env.events().publish(
            (symbol_short!("init"), admin, manager),
            env.ledger().timestamp(),
        );
    }

    /// Disburses funds to an employee. Restricted to the registered manager contract.
    pub fn disburse(env: Env, to: Address, amount: i128, token: Address) {
        assert!(amount > 0, "Amount must be positive");
        let manager: Address = env
            .storage()
            .instance()
            .get(&DataKey::Manager)
            .expect("Not initialized");

        // Verify the caller is indeed the registered manager contract
        manager.require_auth();

        // Pre-authorize token transfer from this contract
        let auth_entry = InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: token.clone(),
                fn_name: Symbol::new(&env, "transfer"),
                args: (env.current_contract_address(), to.clone(), amount).into_val(&env),
            },
            sub_invocations: soroban_sdk::vec![&env],
        });
        env.authorize_as_current_contract(soroban_sdk::vec![&env, auth_entry]);

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        
        // Transfer from this treasury contract to target employee
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        // Update stats
        let key = DataKey::TotalDisbursed(token.clone());
        let total: i128 = env.storage().instance().get(&key).unwrap_or(0);
        env.storage().instance().set(&key, &(total + amount));

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "disbursed"), to, token),
            amount,
        );
    }

    /// Records deposit to the treasury. Useful for logging and UI metrics.
    pub fn deposit(env: Env, from: Address, amount: i128, token: Address) {
        from.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        
        // Transfer tokens to the treasury
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        // Update stats
        let key = DataKey::TotalDeposited(token.clone());
        let total: i128 = env.storage().instance().get(&key).unwrap_or(0);
        env.storage().instance().set(&key, &(total + amount));

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "deposited"), from, token),
            amount,
        );
    }

    /// Withdraws funds from the treasury. Restricted to the treasury admin.
    pub fn withdraw(env: Env, to: Address, amount: i128, token: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
        assert!(amount > 0, "Amount must be positive");

        // Pre-authorize token transfer from this contract
        let auth_entry = InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: token.clone(),
                fn_name: Symbol::new(&env, "transfer"),
                args: (env.current_contract_address(), to.clone(), amount).into_val(&env),
            },
            sub_invocations: soroban_sdk::vec![&env],
        });
        env.authorize_as_current_contract(soroban_sdk::vec![&env, auth_entry]);

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "withdrawn"), to, token),
            amount,
        );
    }

    /// Updates the authorized manager contract address. Restricted to admin.
    pub fn update_manager(env: Env, new_manager: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Manager, &new_manager);

        env.events().publish(
            (symbol_short!("upd_mngr"), new_manager),
            env.ledger().timestamp(),
        );
    }

    /// Updates the treasury administrator. Restricted to admin.
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

    /// Getters
    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    pub fn get_manager(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Manager)
    }

    pub fn get_total_deposited(env: Env, token: Address) -> i128 {
        env.storage().instance().get(&DataKey::TotalDeposited(token)).unwrap_or(0)
    }

    pub fn get_total_disbursed(env: Env, token: Address) -> i128 {
        env.storage().instance().get(&DataKey::TotalDisbursed(token)).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
