import {
  rpc,
  Horizon,
  TransactionBuilder,
  Account,
  Operation,
  Networks,
  Address,
  scValToNative,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import config from "./config.json";
import { Employee, ActivityEvent } from "@/types/payroll";

// Default network values from configuration
export const MANAGER_CONTRACT = config.managerContractId;
export const TREASURY_CONTRACT = config.treasuryContractId;
export const TOKEN_CONTRACT = config.tokenContractId;

// Initialize Soroban RPC server
export const server = new rpc.Server(config.rpcUrl, {
  allowHttp: config.network === "local" || config.network === "standalone",
});

// Initialize Horizon server (for native XLM balance lookups)
export const horizon = new Horizon.Server(
  config.network === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org"
);

/**
 * Fetch native XLM balance of an account on Stellar.
 */
export async function getXlmBalance(address: string): Promise<string> {
  try {
    const account = await horizon.loadAccount(address);
    const balance = account.balances.find((b) => b.asset_type === "native");
    return balance ? balance.balance : "0.0000000";
  } catch (error) {
    console.error("Failed to load XLM balance:", error);
    return "0.0000000";
  }
}

/**
 * Query the token balance of the treasury contract (e.g. USDC or XLM).
 */
export async function getTokenBalance(targetAddress: string, tokenContract: string): Promise<number> {
  try {
    const dummySource = new Account("GCNF6QIYA6N3RWEQVON7Q4ECM6G652SB7Z7ES4REDWADGJNEDW4WQJBD", "0");
    const tx = new TransactionBuilder(dummySource, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: tokenContract,
          function: "balance",
          args: [nativeToScVal(new Address(targetAddress))],
        })
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const native = scValToNative(sim.result.retval);
      return Number(native) / 10000000; // convert stroops back to standard decimals (7 decimals)
    }
    return 0;
  } catch (e) {
    console.error(`Error querying token balance for ${targetAddress}:`, e);
    return 0;
  }
}

/**
 * Fetch stats (Total Deposited & Total Disbursed) from the Treasury Contract.
 */
export async function getTreasuryStats(
  treasuryId: string,
  tokenId: string
): Promise<{ totalDeposited: number; totalDisbursed: number }> {
  try {
    const dummySource = new Account("GCNF6QIYA6N3RWEQVON7Q4ECM6G652SB7Z7ES4REDWADGJNEDW4WQJBD", "0");
    
    // Simulate get_total_deposited
    const txDep = new TransactionBuilder(dummySource, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: treasuryId,
          function: "get_total_deposited",
          args: [nativeToScVal(new Address(tokenId))],
        })
      )
      .setTimeout(30)
      .build();

    // Simulate get_total_disbursed
    const txDisb = new TransactionBuilder(dummySource, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: treasuryId,
          function: "get_total_disbursed",
          args: [nativeToScVal(new Address(tokenId))],
        })
      )
      .setTimeout(30)
      .build();

    const simDep = await server.simulateTransaction(txDep);
    const simDisb = await server.simulateTransaction(txDisb);

    let totalDeposited = 0;
    let totalDisbursed = 0;

    if (rpc.Api.isSimulationSuccess(simDep) && simDep.result) {
      totalDeposited = Number(scValToNative(simDep.result.retval)) / 10000000;
    }
    if (rpc.Api.isSimulationSuccess(simDisb) && simDisb.result) {
      totalDisbursed = Number(scValToNative(simDisb.result.retval)) / 10000000;
    }

    return { totalDeposited, totalDisbursed };
  } catch (e) {
    console.error("Error fetching treasury stats:", e);
    return { totalDeposited: 0, totalDisbursed: 0 };
  }
}

/**
 * Fetch all registered employees and details from the Manager Contract.
 */
export async function getEmployeesList(managerId: string): Promise<Employee[]> {
  try {
    const dummySource = new Account("GCNF6QIYA6N3RWEQVON7Q4ECM6G652SB7Z7ES4REDWADGJNEDW4WQJBD", "0");
    
    // 1. Get list of employee addresses
    const txList = new TransactionBuilder(dummySource, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: managerId,
          function: "get_employees",
          args: [],
        })
      )
      .setTimeout(30)
      .build();

    const simList = await server.simulateTransaction(txList);
    if (!rpc.Api.isSimulationSuccess(simList) || !simList.result) {
      return [];
    }

    const employeeAddresses: string[] = scValToNative(simList.result.retval);
    if (!employeeAddresses || employeeAddresses.length === 0) {
      return [];
    }

    // 2. Fetch details for each employee address (sequentially inside Promise.all)
    const employees = await Promise.all(
      employeeAddresses.map(async (address) => {
        const txEmp = new TransactionBuilder(dummySource, {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(
            Operation.invokeContractFunction({
              contract: managerId,
              function: "get_employee",
              args: [nativeToScVal(new Address(address))],
            })
          )
          .setTimeout(30)
          .build();

        const simEmp = await server.simulateTransaction(txEmp);
        if (rpc.Api.isSimulationSuccess(simEmp) && simEmp.result) {
          const raw = scValToNative(simEmp.result.retval);
          if (raw) {
            return {
              address: raw.address,
              salary: Number(raw.salary) / 10000000, // convert stroops back
              payFrequency: Number(raw.pay_frequency),
              nextPayoutTime: Number(raw.next_payout_time),
              role: raw.role.toString(),
              active: raw.active,
              lastPaidAt: Number(raw.last_paid_at),
            } as Employee;
          }
        }
        return null;
      })
    );

    // Filter out failed loads
    return employees.filter((e): e is Employee => e !== null);
  } catch (error) {
    console.error("Failed to load employees details:", error);
    return [];
  }
}

/**
 * Prepares and simulates a write transaction on-chain.
 * Estimates CPU/Disk resources, appends footprint, and returns base64 XDR.
 */
export async function prepareWriteTx(
  contractId: string,
  functionName: string,
  args: xdr.ScVal[],
  sourceAddress: string
): Promise<string> {
  let sourceAccount;
  try {
    sourceAccount = await server.getAccount(sourceAddress);
  } catch (error: any) {
    throw new Error(
      `Account ${sourceAddress} not found or underfunded on Testnet. Please fund it via Settings/Friendbot.`
    );
  }

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: functionName,
        args,
      })
    )
    .setTimeout(30)
    .build();

  // Run simulation and pack execution fees / storage footprints
  const preparedTx = await server.prepareTransaction(tx);
  return preparedTx.toXDR();
}

/**
 * Submits the signed transaction to the network and polls for confirmation.
 */
export async function submitAndTrackTx(signedTxXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  const response = await server.sendTransaction(tx);

  if (response.status === "ERROR") {
    throw new Error(
      `Transaction rejected by RPC: ${response.errorResult || "Internal transaction syntax failure"}`
    );
  }

  const hash = response.hash;
  let attempts = 0;
  const maxAttempts = 15;

  while (attempts < maxAttempts) {
    const statusRes = await server.getTransaction(hash);
    if (statusRes.status === "SUCCESS") {
      return hash;
    }
    if (statusRes.status === "FAILED") {
      throw new Error(`Transaction reverted on-chain. Result XDR: ${statusRes.resultXdr}`);
    }
    // Wait 1.5 seconds before polling again
    await new Promise((r) => setTimeout(r, 1500));
    attempts++;
  }

  throw new Error(`Transaction tracking timeout. Tx is pending or lost. Hash: ${hash}`);
}

/**
 * Fetches contract event logs from both contracts to construct a unified activity feed.
 */
export async function getContractEvents(
  managerId: string,
  treasuryId: string
): Promise<ActivityEvent[]> {
  try {
    const latestLedgerRes = await server.getLatestLedger();
    const startLedger = latestLedgerRes.sequence - 1500; // Last ~2 hours

    const res = await server.getEvents({
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [managerId, treasuryId],
        },
      ],
      limit: 100,
    });

    const parsedEvents: ActivityEvent[] = [];

    for (const rawEv of res.events) {
      try {
        const topics = rawEv.topic.map((t) => scValToNative(t));
        const value = scValToNative(rawEv.value);

        const eventTypeSymbol = topics[0];
        
        let type: ActivityEvent["type"] = "unknown";
        let actor = "";
        let employee = "";
        let amount = 0;
        let details = "";

        if (eventTypeSymbol === "emp_added") {
          type = "employee_added";
          employee = topics[1];
          amount = Number(topics[2]) / 10000000;
          actor = "Admin";
          details = `Role: ${value.toString()}`;
        } else if (eventTypeSymbol === "emp_updated") {
          type = "employee_updated";
          employee = topics[1];
          amount = Number(topics[2]) / 10000000;
          actor = "Admin";
          details = `Role: ${value.toString()}`;
        } else if (eventTypeSymbol === "emp_terminated") {
          type = "employee_terminated";
          employee = topics[1];
          actor = "Admin";
          details = `Terminated at timestamp: ${value}`;
        } else if (eventTypeSymbol === "payroll_claimed") {
          type = "payroll_paid";
          employee = topics[1];
          amount = Number(topics[2]) / 10000000;
          actor = employee;
          details = `Claimed salary of ${amount} tokens`;
        } else if (eventTypeSymbol === "deposited") {
          type = "treasury_deposit";
          actor = topics[1]; // address of depositor
          amount = Number(value) / 10000000;
          details = `Deposited ${amount} tokens into treasury`;
        } else if (eventTypeSymbol === "withdrawn") {
          type = "treasury_withdraw";
          actor = topics[1]; // address of withdrawer
          amount = Number(value) / 10000000;
          details = `Withdrew ${amount} tokens from treasury`;
        } else {
          continue; // Skip initialization and administrative events
        }

        parsedEvents.push({
          id: rawEv.id,
          type,
          actor,
          employee,
          amount,
          timestamp: Math.floor(new Date(rawEv.ledgerClosedAt).getTime() / 1000),
          details,
        });
      } catch (err) {
        // Skip individual parsing failures
        console.warn("Individual event decode failed:", err);
      }
    }

    return parsedEvents.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Error loading ledger events:", error);
    return [];
  }
}
