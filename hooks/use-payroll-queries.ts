import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getXlmBalance, 
  getTokenBalance, 
  getTreasuryStats, 
  getEmployeesList, 
  getContractEvents, 
  prepareWriteTx, 
  submitAndTrackTx 
} from "@/lib/stellar-contract";
import { signTx } from "@/lib/stellar-wallet";
import { usePayrollStore } from "./use-payroll-store";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

/**
 * Sync user native XLM balance.
 */
export function useXlmBalanceQuery(address: string | null) {
  const setBalance = usePayrollStore((s) => s.setBalance);
  return useQuery({
    queryKey: ["xlmBalance", address],
    queryFn: async () => {
      if (!address) return "0.0000000";
      const bal = await getXlmBalance(address);
      setBalance(bal);
      return bal;
    },
    enabled: !!address,
    refetchInterval: 10000,
  });
}

/**
 * Sync Treasury stats (current token balance, total deposited, total disbursed).
 */
export function useTreasuryDataQuery(enabled: boolean) {
  const { treasuryId, tokenId } = usePayrollStore();
  const setTreasuryBalance = usePayrollStore((s) => s.setTreasuryBalance);
  const setTreasuryStats = usePayrollStore((s) => s.setTreasuryStats);

  return useQuery({
    queryKey: ["treasuryData", treasuryId, tokenId],
    queryFn: async () => {
      if (!treasuryId || !tokenId) return { balance: 0, deposited: 0, disbursed: 0 };
      
      const balance = await getTokenBalance(treasuryId, tokenId);
      const stats = await getTreasuryStats(treasuryId, tokenId);
      
      setTreasuryBalance(balance);
      setTreasuryStats(stats.totalDeposited, stats.totalDisbursed);
      
      return { balance, deposited: stats.totalDeposited, disbursed: stats.totalDisbursed };
    },
    enabled,
    refetchInterval: 8000,
  });
}

/**
 * Sync registered employees list.
 */
export function useEmployeesQuery(enabled: boolean) {
  const { managerId } = usePayrollStore();
  const setEmployees = usePayrollStore((s) => s.setEmployees);

  return useQuery({
    queryKey: ["employees", managerId],
    queryFn: async () => {
      if (!managerId) return [];
      const list = await getEmployeesList(managerId);
      setEmployees(list);
      return list;
    },
    enabled,
    refetchInterval: 8000,
  });
}

/**
 * Sync unified activities / events.
 */
export function useEventsQuery(enabled: boolean) {
  const { managerId, treasuryId } = usePayrollStore();
  const setEvents = usePayrollStore((s) => s.setEvents);

  return useQuery({
    queryKey: ["events", managerId, treasuryId],
    queryFn: async () => {
      if (!managerId || !treasuryId) return [];
      const events = await getContractEvents(managerId, treasuryId);
      setEvents(events);
      return events;
    },
    enabled,
    refetchInterval: 8000,
  });
}

/**
 * General helper to construct a transaction mutation with automated status tracking.
 */
function useContractMutation(
  contractSelector: (s: any) => string,
  functionName: string,
  txTitle: string,
  argsBuilder: (params: any, callerAddress: string) => xdr.ScVal[]
) {
  const queryClient = useQueryClient();
  const address = usePayrollStore((s) => s.address);
  const contractId = usePayrollStore(contractSelector);
  const addTransaction = usePayrollStore((s) => s.addTransaction);
  const updateTransactionStatus = usePayrollStore((s) => s.updateTransactionStatus);

  return useMutation({
    mutationFn: async (params: any) => {
      if (!address) {
        throw new Error("Wallet is not connected.");
      }
      if (!contractId) {
        throw new Error("Target contract is not configured.");
      }

      // 1. Build ScVal parameters list
      const args = argsBuilder(params, address);

      // 2. Simulate transaction & build footprint envelopes
      const rawXdr = await prepareWriteTx(contractId, functionName, args, address);

      // 3. Prompt user signature via wallet kit
      const signedXdr = await signTx(rawXdr, address);

      // 4. Submit to RPC node and track pending lifecycle
      const hash = await submitAndTrackTx(signedXdr);

      // 5. Add to local queue as pending/processing
      addTransaction(hash, txTitle);

      try {
        updateTransactionStatus(hash, "processing");
        // Re-verify tracking finishes
        await submitAndTrackTx(signedXdr);
        updateTransactionStatus(hash, "success");
        return hash;
      } catch (err) {
        updateTransactionStatus(hash, "failed");
        throw err;
      }
    },
    onSuccess: () => {
      // Invalidate query caches to trigger instant UI refresh
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["treasuryData"] });
      queryClient.invalidateQueries({ queryKey: ["xlmBalance", address] });
    },
  });
}

/**
 * Mutation to add an employee.
 */
export function useAddEmployeeMutation() {
  return useContractMutation(
    (s) => s.managerId,
    "add_employee",
    "Register Employee",
    (params: { employee: string; salary: number; payFrequency: number; role: string }) => {
      const stroops = BigInt(Math.floor(params.salary * 10000000));
      return [
        nativeToScVal(new Address(params.employee.trim())),
        nativeToScVal(stroops, { type: "i128" }),
        nativeToScVal(BigInt(params.payFrequency), { type: "u64" }),
        nativeToScVal(params.role),
      ];
    }
  );
}

/**
 * Mutation to update an employee.
 */
export function useUpdateEmployeeMutation() {
  return useContractMutation(
    (s) => s.managerId,
    "update_employee",
    "Update Employee Details",
    (params: { employee: string; salary: number; payFrequency: number; role: string }) => {
      const stroops = BigInt(Math.floor(params.salary * 10000000));
      return [
        nativeToScVal(new Address(params.employee.trim())),
        nativeToScVal(stroops, { type: "i128" }),
        nativeToScVal(BigInt(params.payFrequency), { type: "u64" }),
        nativeToScVal(params.role),
      ];
    }
  );
}

/**
 * Mutation to terminate an employee.
 */
export function useTerminateEmployeeMutation() {
  return useContractMutation(
    (s) => s.managerId,
    "terminate_employee",
    "Terminate Employee",
    (params: { employee: string }) => {
      return [nativeToScVal(new Address(params.employee.trim()))];
    }
  );
}

/**
 * Mutation to trigger employee payroll payout claim.
 */
export function useClaimPayrollMutation() {
  return useContractMutation(
    (s) => s.managerId,
    "claim_payroll",
    "Disburse Payroll Payout",
    (params: { employee: string }) => {
      return [nativeToScVal(new Address(params.employee.trim()))];
    }
  );
}

/**
 * Mutation to deposit funds into the treasury contract.
 */
export function useDepositTreasuryMutation() {
  return useContractMutation(
    (s) => s.treasuryId,
    "deposit",
    "Fund Treasury Vault",
    (params: { amount: number }, caller) => {
      const stroops = BigInt(Math.floor(params.amount * 10000000));
      const { tokenId } = usePayrollStore.getState();
      return [
        nativeToScVal(new Address(caller.trim())),
        nativeToScVal(stroops, { type: "i128" }),
        nativeToScVal(new Address(tokenId.trim())),
      ];
    }
  );
}

/**
 * Mutation to withdraw funds from the treasury contract (Admin only).
 */
export function useWithdrawTreasuryMutation() {
  return useContractMutation(
    (s) => s.treasuryId,
    "withdraw",
    "Withdraw Treasury Funds",
    (params: { amount: number; to: string }) => {
      const stroops = BigInt(Math.floor(params.amount * 10000000));
      const { tokenId } = usePayrollStore.getState();
      return [
        nativeToScVal(new Address(params.to.trim())),
        nativeToScVal(stroops, { type: "i128" }),
        nativeToScVal(new Address(tokenId.trim())),
      ];
    }
  );
}
