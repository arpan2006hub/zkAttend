import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import AttendanceSystemAbi from "../abis/AttendanceSystem.json";
import { usePublicClient } from "wagmi";
import { useContractRead } from "wagmi";
import { createPublicClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { io, Socket } from "socket.io-client";
import { CONTRACT_ADDRESSES } from "../config/contracts";

const ATTENDANCE_SYSTEM_ADDRESS = CONTRACT_ADDRESSES.ATTENDANCE_SYSTEM as `0x${string}`;

export default function Teacher() {
  const { address } = useAccount();
  const [className, setClassName] = useState("");
  const [classDate, setClassDate] = useState("");
  const [uniqueCode, setUniqueCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  // current class name not needed in UI; omit state to satisfy no-unused-locals
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [codeTimestamp, setCodeTimestamp] = useState<number | null>(null);
  // legacy on-chain polling removed in frontend-only mode
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  // Frontend-only rotation state (off-chain)
  const [feRotating, setFeRotating] = useState(false);
  const [feCurrentCode, setFeCurrentCode] = useState<string>("");
  const rotateTimer = useRef<number | undefined>(undefined);
  const socketRef = useRef<Socket | null>(null);
  // Session workflow flags
  const [classCreated, setClassCreated] = useState(false);
  const [rotationEnded, setRotationEnded] = useState(false);
  const disabledBtnStyle: any = { background: '#E9ECEF', color: '#666', border: '1px solid #ccc' };

  const { data: classesData, refetch: refetchClass } = useContractRead({
    address: ATTENDANCE_SYSTEM_ADDRESS,
    abi: (AttendanceSystemAbi as any).abi,
    functionName: "classes",
    args: [uniqueCode || ""],
  });
  // no on-chain getCurrentAttendanceCode in frontend-only mode

  const registeredRead = useContractRead({
    address: ATTENDANCE_SYSTEM_ADDRESS,
    abi: (AttendanceSystemAbi as any).abi,
    functionName: "registeredTeachers",
    args: [address || "0x0000000000000000000000000000000000000000"],
  });

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const pc = useMemo(() => {
    if (publicClient) return publicClient as any;
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        return createPublicClient({ chain: sepolia, transport: custom((window as any).ethereum) });
      }
    } catch {}
    return createPublicClient({ chain: sepolia, transport: http('https://rpc.sepolia.org') });
  }, [publicClient]);

  useEffect(() => {
    if (classesData && (classesData as any)[0]) {
      // classes returns tuple: name, teacher, uniqueCode, date, isActive, currentAttendanceCode, codeTimestamp
      const attendanceCode = (classesData as any)[5];
      const ts = (classesData as any)[6];
      setCurrentCode(attendanceCode || null);
      setCodeTimestamp(ts ? Number(ts) : null);
    }
  }, [classesData]);

  // Contract writes: use wallet client directly for robustness across wagmi versions

  // Read whether the connected address is registered as a teacher
  useEffect(() => {
    let mounted = true;
    async function checkRegistered() {
      if (!address) {
        setIsRegistered(null);
        return;
      }
      try {
        // prefer wagmi read hook if publicClient isn't ready
        if (registeredRead?.refetch) {
          const r = await registeredRead.refetch();
          const val = (r as any)?.data ?? registeredRead.data;
          if (mounted) setIsRegistered(Boolean(val));
        } else if ((pc as any)?.readContract) {
          const res = await (pc as any).readContract({
            address: ATTENDANCE_SYSTEM_ADDRESS,
            abi: (AttendanceSystemAbi as any).abi,
            functionName: "registeredTeachers",
            args: [address],
          });
          if (mounted) setIsRegistered(Boolean(res));
        } else {
          if (mounted) setIsRegistered(null);
        }
      } catch (err) {
        if (mounted) setIsRegistered(null);
      }
    }
    checkRegistered();
    return () => { mounted = false; };
  }, [address, publicClient]);

  // Remove on-chain autocode polling in frontend-only mode

  // no auto-rotate effect needed; rotation derived on-chain

  // Finalize (Merkle commit) — server computes Merkle root, we preflight and then commit on-chain with proper receipt checks
  const handleFinalizeMerkle = useCallback(async () => {
    try {
      if (!uniqueCode) {
        setStatus("Enter/select a class unique code first.");
        return;
      }
      if (!address) {
        setStatus('Connect a wallet first.');
        return;
      }
      // Basic ownership/active preflight
      try {
        const data = await (pc as any).readContract({
          address: ATTENDANCE_SYSTEM_ADDRESS,
          abi: (AttendanceSystemAbi as any).abi,
          functionName: 'classes',
          args: [uniqueCode],
        });
        const classTeacher = (data as any)?.[1] as string | undefined;
        const isActive = Boolean((data as any)?.[4]);
        if (!classTeacher || classTeacher.toLowerCase() !== address.toLowerCase()) {
          setStatus('Finalize blocked: you are not the teacher of this class. Create/select the correct class code.');
          return;
        }
        if (!isActive) {
          // Could be already finalized or never activated
          const fin = await (pc as any).readContract({
            address: ATTENDANCE_SYSTEM_ADDRESS,
            abi: (AttendanceSystemAbi as any).abi,
            functionName: 'getFinalization',
            args: [uniqueCode],
          });
          const already = Boolean((fin as any)?.[3]);
          setStatus(already ? 'Already finalized for this class.' : 'Class is not active.');
          if (already) return;
        }
      } catch (e: any) {
        // if read fails, continue but warn
        console.warn('Preflight class read failed', e);
      }
    setStatus('Preparing Merkle on server...');
    const clientChainId = (pc as any)?.chain?.id || 11155111;
    const prep = await fetch(`http://localhost:4000/api/finalize/${encodeURIComponent(uniqueCode)}?chainId=${encodeURIComponent(String(clientChainId))}&contract=${encodeURIComponent(ATTENDANCE_SYSTEM_ADDRESS)}`);
      if (!prep.ok) {
        const e = await prep.json().catch(() => ({}));
        setStatus(`Finalize prepare failed: ${e.error || prep.statusText}`);
        return;
      }
  const prepJson = await prep.json();
  const { root, total, contentHash, cid } = prepJson as { root: `0x${string}`; total: number; contentHash: `0x${string}`; cid?: string };
      if (!root || !cid) {
        setStatus('Finalize prepare failed: missing root or cid from server.');
        return;
      }
      const ipfsLink = cid ? `https://ipfs.io/ipfs/${cid}` : null;
      setStatus(`Preflight simulate... attendees=${total}${ipfsLink ? ` | cid=${cid}` : ''}`);

      // Simulate to catch revert reason before sending tx
      try {
        if ((pc as any)?.simulateContract) {
          await (pc as any).simulateContract({
            address: ATTENDANCE_SYSTEM_ADDRESS,
            abi: (AttendanceSystemAbi as any).abi,
            functionName: 'finalizeClass',
            args: [uniqueCode, root, BigInt(total), contentHash, cid],
            account: address,
          });
        }
      } catch (simErr: any) {
        setStatus(`Finalize would revert: ${simErr?.shortMessage || simErr?.message || 'simulation failed'}`);
        return;
      }

      setStatus(`Submitting finalize tx... attendees=${total}`);
      if (!walletClient) throw new Error("No wallet client to send transaction");
      const tx = await (walletClient as any).writeContract({
        address: ATTENDANCE_SYSTEM_ADDRESS,
        abi: (AttendanceSystemAbi as any).abi,
        functionName: "finalizeClass",
        args: [uniqueCode, root, BigInt(total), contentHash, cid],
        gas: 500000,
      });
      // wagmi v2 returns tx hash (0x...) — handle both cases
      if (tx && typeof tx === 'string') {
        setStatus(`Tx submitted: ${tx} — waiting confirmation...`);
        if ((pc as any)?.waitForTransactionReceipt) {
          const receipt = await (pc as any).waitForTransactionReceipt({ hash: tx });
          if (receipt?.status !== 'success') {
            setStatus(`Finalize failed on-chain. Status=${receipt?.status}. Check you are class teacher and class is active.`);
            return;
          }
        }
      } else if (tx?.wait) {
        // some providers return a tx object
        const r = await tx.wait();
        const ok = !r?.status || r.status === 1;
        if (!ok) {
          setStatus('Finalize failed on-chain (receipt status=0).');
          return;
        }
      }
  const finalLink = cid ? ` | cid=${cid}` : '';
  setStatus(`Finalized: root=${root} total=${total}${finalLink}`);
    } catch (e: any) {
      setStatus(`Finalize error: ${e?.message || e}`);
    }
  }, [uniqueCode, address, walletClient, pc]);

  async function handleRegisterTeacher() {
    try {
      setStatus("Sending registerTeacher tx...");
      if (!walletClient) throw new Error("No wallet client available to send transaction");
      const res: any = await (walletClient as any).writeContract({
        address: ATTENDANCE_SYSTEM_ADDRESS,
        abi: (AttendanceSystemAbi as any).abi,
        functionName: "registerTeacher",
        args: [],
        gas: 300000,
      });
      setStatus("Waiting for confirmation...");
      if (res && typeof res.wait === "function") {
        await res.wait();
        setStatus("Registered as teacher — confirmed.");
        setIsRegistered(true);
      } else if (typeof res === "string") {
        setStatus(`Transaction submitted: ${res}`);
        try {
          if ((pc as any)?.waitForTransactionReceipt) {
            await (pc as any).waitForTransactionReceipt({ hash: res as `0x${string}` });
          }
          setIsRegistered(true);
        } catch (err) {
          // ignore
        }
  } else if (res && res.hash) {
        setStatus(`Transaction submitted: ${res.hash}`);
        try {
          if ((pc as any)?.waitForTransactionReceipt) {
            await (pc as any).waitForTransactionReceipt({ hash: res.hash as `0x${string}` });
          }
          setIsRegistered(true);
        } catch (err) {
          // ignore
        }
      } else {
        setStatus("Transaction submitted (no confirmation available).");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  }

  async function handleCreateClass() {
    try {
      setStatus("Creating class...");
      if (!address) {
        setStatus('Connect a wallet first.');
        return;
      }
      const code = uniqueCode || ("CLS" + Math.random().toString(36).slice(2, 10));
      const dateTs = classDate ? Math.floor(new Date(classDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
      if (!walletClient) throw new Error("No wallet client available to send transaction");
      // Preflight simulate to catch common reverts (e.g., not registered, code exists)
      try {
        if ((pc as any)?.simulateContract) {
          await (pc as any).simulateContract({
            address: ATTENDANCE_SYSTEM_ADDRESS,
            abi: (AttendanceSystemAbi as any).abi,
            functionName: 'createClass',
            args: [className || 'Unnamed', code, dateTs],
            account: address,
          });
        }
      } catch (simErr: any) {
        setStatus(`Create would revert: ${simErr?.shortMessage || simErr?.message || 'simulation failed'}`);
        return;
      }
      const res: any = await (walletClient as any).writeContract({
        address: ATTENDANCE_SYSTEM_ADDRESS,
        abi: (AttendanceSystemAbi as any).abi,
        functionName: "createClass",
        args: [className || "Unnamed", code, dateTs],
        gas: 300000,
      });
      setStatus("Waiting for confirmation...");
      if (res && typeof res.wait === "function") {
        await res.wait();
        setStatus(`Class created (code: ${code})`);
        setClassCreated(true);
        setRotationEnded(false);
      } else if (typeof res === "string") {
        setStatus(`Transaction submitted: ${res}`);
        // Optimistically consider class created for this session once submitted
        setClassCreated(true);
        setRotationEnded(false);
  } else if (res && res.hash) {
        setStatus(`Transaction submitted: ${res.hash}`);
        setClassCreated(true);
        setRotationEnded(false);
      } else {
        setStatus(`Class created (code: ${code})`);
        setClassCreated(true);
        setRotationEnded(false);
      }
      setUniqueCode(code);
      // refresh class info
      setTimeout(() => refetchClass(), 1000);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  }

  // Frontend-only rotation helpers
  function randCode6() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  const ensureSocket = useCallback(() => {
    if (!socketRef.current) {
      socketRef.current = io("http://localhost:4000", { transports: ["websocket"] });
    }
    return socketRef.current;
  }, []);

  const joinRoom = useCallback((room: string) => {
    const s = ensureSocket();
    s.emit("join", { room, role: "teacher" });
  }, [ensureSocket]);

  const startFrontendRotate = useCallback(() => {
    if (!uniqueCode) {
      setStatus("Enter a unique class code first.");
      return;
    }
    joinRoom(uniqueCode);
    setFeRotating(true);
    setRotationEnded(false);
    setStatus("Starting frontend rotation (no chain)...");
    const tick = () => {
      const code = randCode6();
      const ts = Date.now();
      setFeCurrentCode(code);
      ensureSocket().emit("codeUpdate", { room: uniqueCode, code, ts });
    };
    tick();
    rotateTimer.current = window.setInterval(tick, 5000) as any;
  }, [uniqueCode, joinRoom, ensureSocket]);

  const stopFrontendRotate = useCallback(() => {
    if (rotateTimer.current) window.clearInterval(rotateTimer.current);
    rotateTimer.current = undefined;
    setFeRotating(false);
    setFeCurrentCode("");
    setStatus("Stopped frontend rotation.");
    ensureSocket().emit("endSession", { room: uniqueCode });
    setRotationEnded(true);
  }, [uniqueCode, ensureSocket]);

  // Button enablement based on session workflow
  const hasSelectedCreatedClass = classCreated && !!uniqueCode;
  const startDisabled = !hasSelectedCreatedClass || feRotating || rotationEnded;
  const stopDisabled = !feRotating;
  const verifyDisabled = !hasSelectedCreatedClass || (!feRotating && !rotationEnded);
  const finalizeDisabled = !address || !uniqueCode || !rotationEnded;
  const createDisabled = !address || classCreated;

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-2">Teacher Dashboard</h2>
      <p className="mb-2">Register as a teacher, create classes, and start attendance sessions.</p>

      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={handleRegisterTeacher} disabled={!address || isRegistered === true}>
          {isRegistered ? "Registered" : "Register as Teacher"}
        </button>
          <button
            className="btn"
            style={{ marginLeft: 12, background: '#eee', color: '#111', border: '1px solid #333' }}
            onClick={async () => {
              if (!address) return;
              try {
                if (registeredRead?.refetch) {
                  const r = await registeredRead.refetch();
                  const val = (r as any)?.data ?? registeredRead.data;
                  setIsRegistered(Boolean(val));
                  setStatus(`On-chain registeredTeachers[${address}] = ${String(val)}`);
                } else if ((pc as any)?.readContract) {
                  const res = await (pc as any).readContract({
                    address: ATTENDANCE_SYSTEM_ADDRESS,
                    abi: (AttendanceSystemAbi as any).abi,
                    functionName: 'registeredTeachers',
                    args: [address],
                  });
                  setIsRegistered(Boolean(res));
                  setStatus(`On-chain registeredTeachers[${address}] = ${String(res)}`);
                } else {
                  setStatus('No RPC client available to check registration');
                }
              } catch (err: any) {
                setStatus(`Error checking registration: ${err?.message || err}`);
              }
            }}
          >
            Check registration
          </button>
        <div style={{ marginTop: 8 }}>
          <strong>Your address:</strong> {address ?? "Not connected"}
        </div>
        {isRegistered === true && (
          <div style={{ marginTop: 6, color: '#070' }}><strong>Note:</strong> This address is already registered as a teacher.</div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <h3>Create Class</h3>
        <input placeholder="Class name" value={className} onChange={(e) => setClassName(e.target.value)} />
        <input type="datetime-local" value={classDate} onChange={(e) => setClassDate(e.target.value)} />
        <input placeholder="Unique code (optional)" value={uniqueCode} onChange={(e) => setUniqueCode(e.target.value)} />
        <div>
          <button className="btn" onClick={handleCreateClass} disabled={createDisabled} style={createDisabled ? disabledBtnStyle : undefined}>
            Create Class
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <h3>Publish / Rotate Attendance Code</h3>
        <div>Selected class code: <strong>{uniqueCode || "(none)"}</strong></div>
        <div>Current attendance code (on-chain): <strong>{currentCode ?? "-"}</strong></div>
        <div>Code set at: {codeTimestamp ? new Date(codeTimestamp * 1000).toLocaleString() : "-"}</div>
        <div>
          <button className="btn" onClick={startFrontendRotate} disabled={startDisabled} style={startDisabled ? disabledBtnStyle : undefined}>
            Start Frontend Rotate (no chain)
          </button>
          <button className="btn" style={{ marginLeft: 12, ...(stopDisabled ? disabledBtnStyle : {}) }} onClick={stopFrontendRotate} disabled={stopDisabled}>
            Stop Frontend Rotate
          </button>
          <button
            className="btn"
            style={{ marginLeft: 12, background: '#eef', color: '#111', border: '1px solid #88a', ...(verifyDisabled ? disabledBtnStyle : {}) }}
            onClick={async () => {
              try {
                const parts: string[] = [];
                parts.push(`Address: ${address ?? 'not connected'}`);
                if ((pc as any)?.chain?.id) parts.push(`ChainId: ${(pc as any).chain.id}`);
                if ((pc as any)?.getBytecode) {
                  const bc = await (pc as any).getBytecode({ address: ATTENDANCE_SYSTEM_ADDRESS });
                  parts.push(`Contract code at ${ATTENDANCE_SYSTEM_ADDRESS}: ${bc ? 'present' : 'missing'}`);
                }
                if ((pc as any)?.readContract && uniqueCode) {
                  const data = await (pc as any).readContract({
                    address: ATTENDANCE_SYSTEM_ADDRESS,
                    abi: (AttendanceSystemAbi as any).abi,
                    functionName: 'classes',
                    args: [uniqueCode],
                  });
                          parts.push(`Class[${uniqueCode}] -> name=${String(data?.[0])}, teacher=${String(data?.[1])}, isActive=${String(Boolean(data?.[4]))}`);
                } else {
                  parts.push('Skip class read: RPC not available or no uniqueCode.');
                }
                setStatus(parts.join(' | '));
              } catch (err: any) {
                setStatus(`Verify error: ${err?.message || err}`);
              }
            }}
            disabled={verifyDisabled}
          >
            Verify contract & class
          </button>
          <button className="btn" style={{ marginLeft: 12, ...(finalizeDisabled ? disabledBtnStyle : {}) }} onClick={handleFinalizeMerkle} disabled={finalizeDisabled}>
            Finalize (Merkle commit)
          </button>
        </div>
      </div>

      <div>
        <strong>Status:</strong> {status}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3>Rotating Attendance Code (frontend)</h3>
        {feRotating ? (
          <div style={{
            marginTop: 8,
            padding: 12,
            border: '2px dashed #444',
            display: 'inline-block',
            fontSize: 24,
            fontWeight: 700,
            minWidth: 160,
            textAlign: 'center',
            background: '#fff'
          }}>
            {feCurrentCode || '-'}
          </div>
        ) : (
          <div style={{ color: '#666' }}>No active rotating code. Click "Start Frontend Rotate (no chain)" to start.</div>
        )}
      </div>
    </div>
  );
}

