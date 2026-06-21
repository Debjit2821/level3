import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LandingPage from "./page";
import { usePayrollStore } from "@/hooks/use-payroll-store";

// Mock next/navigation module
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("Zustand State Store", () => {
  it("should initialize with default states", () => {
    const state = usePayrollStore.getState();
    expect(state.address).toBeNull();
    expect(state.balance).toBe("0.0000000");
    expect(state.employees).toEqual([]);
    expect(state.transactions).toEqual([]);
  });

  it("should update connected wallet address", () => {
    const store = usePayrollStore.getState();
    store.setAddress("GDT37UGSKAIKDUGC73VHAI6HASL27O5YTCHONKRIIH7AJBMBIQPWRVX3");
    
    const updatedState = usePayrollStore.getState();
    expect(updatedState.address).toBe("GDT37UGSKAIKDUGC73VHAI6HASL27O5YTCHONKRIIH7AJBMBIQPWRVX3");
  });

  it("should record transactions in history log", () => {
    const store = usePayrollStore.getState();
    store.addTransaction("abcd1234hash", "Disburse Salary");
    
    const updatedState = usePayrollStore.getState();
    expect(updatedState.transactions.length).toBe(1);
    expect(updatedState.transactions[0].hash).toBe("abcd1234hash");
    expect(updatedState.transactions[0].title).toBe("Disburse Salary");
    expect(updatedState.transactions[0].status).toBe("pending");
  });
});

describe("Landing Page Component", () => {
  it("should render welcome headlines and cta links", () => {
    render(<LandingPage />);
    
    const heading = screen.getByRole("heading", { name: /Decentralized Payroll/i });
    expect(heading).toBeInTheDocument();

    const ctaButton = screen.getByText(/Access Operator Console/i);
    expect(ctaButton).toBeInTheDocument();
  });
});
