import { useAccount, useConnect } from 'wagmi'
let useWeb3Modal: any = undefined
try {
  // optional import - may not exist in all installs
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useWeb3Modal = require('@web3modal/wagmi/react').useWeb3Modal
} catch (e) {
  useWeb3Modal = undefined
}

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const web3modal = useWeb3Modal ? useWeb3Modal() : null

  const onClick = async () => {
    if (web3modal && web3modal.open) {
      web3modal.open()
      return
    }

    // fallback: use first injected connector (MetaMask)
    const injected = connectors.find((c: any) => c.id === 'injected')
    if (injected) connect({ connector: injected })
  }

  if (isConnected) {
    return (
      <button className="btn" onClick={onClick}>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    )
  }

  return (
    <button className="btn" onClick={onClick}>
      Connect Wallet
    </button>
  )
}