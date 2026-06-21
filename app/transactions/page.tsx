"use client";

import { Navigation } from "@/components/navigation";
import { usePayrollStore } from "@/hooks/use-payroll-store";
import { History, ExternalLink, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";

export default function TransactionCenterPage() {
  const { transactions } = usePayrollStore();

  return (
    <div className="min-h-screen bg-slate-50 md:pl-64">
      <Navigation />

      <main className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transaction Center</h1>
          <p className="text-xs text-slate-500">Track current session transactions dispatch progress and confirmation logs.</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-sm font-bold text-slate-900">Transaction History Queue</h3>
          </div>

          <div className="divide-y divide-slate-100">
            {transactions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <History className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                No transactions dispatched in this session. Triggering console methods registers activity.
              </div>
            ) : (
              transactions.map((tx) => {
                let statusClass = "bg-yellow-50 text-yellow-700 border-yellow-200";
                let iconClass = "text-yellow-500";
                let Icon = RefreshCw;

                if (tx.status === "processing") {
                  statusClass = "bg-blue-50 text-blue-700 border-blue-200";
                  iconClass = "text-blue-500";
                  Icon = RefreshCw;
                } else if (tx.status === "success") {
                  statusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                  iconClass = "text-emerald-500";
                  Icon = ShieldCheck;
                } else if (tx.status === "failed") {
                  statusClass = "bg-rose-50 text-rose-700 border-rose-200";
                  iconClass = "text-rose-500";
                  Icon = AlertCircle;
                }

                return (
                  <div key={tx.hash} className="p-6 hover:bg-slate-50/50 transition">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 mb-1">{tx.title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span>Hash:</span>
                          <span className="font-semibold">{tx.hash.slice(0, 16)}...{tx.hash.slice(-16)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}>
                          <Icon className={`h-3 w-3 ${tx.status === "pending" || tx.status === "processing" ? "animate-spin" : ""}`} />
                          <span>{tx.status}</span>
                        </span>
                        
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition"
                        >
                          <span>Explorer</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
