import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { io, Socket } from "socket.io-client";
import AttendanceSystemAbi from "../abis/AttendanceSystem.json";
import { useWalletClient } from "wagmi";
import { CONTRACT_ADDRESSES } from "../config/contracts";

const SOCKET_URL = "http://localhost:4000";

function randomOptions(correct: string) {
  const opts = new Set<string>();
  opts.add(correct);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  while (opts.size < 4) {
    let out = "";
    for (let i = 0; i < correct.length; i++) out += chars[Math.floor(Math.random() * chars.length)];
    opts.add(out);
  }
  return Array.from(opts).sort(() => Math.random() - 0.5);
}

export default function Student() {
  const { address } = useAccount();
  const [uniqueCode, setUniqueCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [markingActive, setMarkingActive] = useState(false);
  const [, setLiveCode] = useState<string>("");
  const socketRef = useRef<Socket | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const ATTENDANCE_SYSTEM_ADDRESS = CONTRACT_ADDRESSES.ATTENDANCE_SYSTEM as `0x${string}`;

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = s;
    s.on("codeUpdate", ({ code }) => {
      setLiveCode(code || "");
      if (code) setOptions(randomOptions(code));
      else setOptions([]);
    });
    s.on("markResult", ({ ok, reason }) => {
      setStatus(ok ? "Attendance marked!" : `Rejected: ${reason || "Invalid"}`);
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const startListening = useCallback(() => {
    if (!uniqueCode) {
      setStatus("Enter a class code first");
      return;
    }
    socketRef.current?.emit("join", { room: uniqueCode, role: "student" });
    setMarkingActive(true);
    setStatus("Listening for live codes...");
  }, [uniqueCode]);

  const handleMarkAttendance = useCallback((selected: string) => {
    setStatus(`Submitting attendance (${selected})...`);
    socketRef.current?.emit("markAttempt", { room: uniqueCode, address, code: selected });
  }, [uniqueCode, address]);

  const handleClaim = useCallback(async () => {
    try {
      if (!address) { setStatus('Connect wallet first'); return; }
      if (!uniqueCode) { setStatus('Enter class code'); return; }
      // Get Merkle proof from server built during teacher finalize
      const r = await fetch(`http://localhost:4000/api/proof/${encodeURIComponent(uniqueCode)}?address=${encodeURIComponent(address)}`);
      const js = await r.json();
      if (!r.ok) { setStatus(js?.error ? `No proof: ${js.error}` : 'No proof'); return; }
      const { proof } = js as { proof: `0x${string}`[] };
      if (!walletClient || !publicClient) { setStatus('Wallet/RPC not available'); return; }

      // Preflight simulate to catch revert reasons without spending gas
      setStatus('Preflight simulate claim...');
      let request: any;
      try {
        const sim = await (publicClient as any).simulateContract({
          address: ATTENDANCE_SYSTEM_ADDRESS,
          abi: (AttendanceSystemAbi as any).abi,
          functionName: 'claim',
          args: [uniqueCode, address, proof],
          account: address,
        });
        request = (sim as any).request;
      } catch (simErr: any) {
        setStatus(`Claim would revert: ${simErr?.shortMessage || simErr?.message || 'simulation failed'}`);
        return;
      }

      setStatus('Submitting claim tx...');
      const hashOrObj = await (walletClient as any).writeContract(request ?? {
        address: ATTENDANCE_SYSTEM_ADDRESS,
        abi: (AttendanceSystemAbi as any).abi,
        functionName: 'claim',
        args: [uniqueCode, address, proof],
        gas: 300000,
      });

      if (typeof hashOrObj === 'string') {
        const receipt = await (publicClient as any).waitForTransactionReceipt({ hash: hashOrObj });
        if (receipt?.status !== 'success') { setStatus('Claim failed on-chain (receipt status = 0).'); return; }
        setStatus('Claimed on-chain!');
        return;
      }
      if (hashOrObj?.wait) {
        const rc = await hashOrObj.wait();
        const ok = !rc?.status || rc.status === 1;
        setStatus(ok ? 'Claimed on-chain!' : 'Claim failed on-chain (receipt status = 0).');
        return;
      }
      // Fallback: unknown object type, optimistically query receipt if it has .hash
      if (hashOrObj?.hash) {
        const receipt = await (publicClient as any).waitForTransactionReceipt({ hash: hashOrObj.hash });
        if (receipt?.status !== 'success') { setStatus('Claim failed on-chain (receipt status = 0).'); return; }
        setStatus('Claimed on-chain!');
        return;
      }
      setStatus('Transaction submitted. Waiting may be required.');
    } catch (e: any) {
      setStatus(`Claim error: ${e?.message || e}`);
    }
  }, [address, uniqueCode, walletClient, publicClient]);

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-2">Student Dashboard</h2>
      <p className="mb-2">Join a class and mark your attendance.</p>

      <div style={{ marginBottom: 12 }}>
        <input placeholder="Enter class unique code" value={uniqueCode} onChange={(e) => setUniqueCode(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={startListening} disabled={!address}>
            Mark Attendance
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <strong>Connected:</strong> {address ?? "Not connected"}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <h3>Live Attendance</h3>
        <div style={{ marginTop: 8 }}>
          <h4>Pick the currently projected code</h4>
          {!markingActive && <div style={{ color: '#666' }}>Click "Mark Attendance" to start viewing rotating codes.</div>}
          {markingActive && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {options.map((op) => (
                <button key={op} className="btn" onClick={() => handleMarkAttendance(op)}>
                  {op}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={handleClaim} disabled={!address}>Claim Token</button>
        </div>
      </div>

      <div>
        <strong>Status:</strong> {status}
      </div>
    </div>
  );
}
