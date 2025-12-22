# zkAttend - Decentralized Attendance System

A decentralized attendance system that allows students to mark and prove attendance without sharing personal data or depending on a central authority. Built on Ethereum Sepolia testnet with soulbound tokens for verifiable credentials.

## 🎯 Objective

Create a decentralized attendance system that:
- Allows students/attendees to prove attendance without sharing personal data
- Eliminates dependency on central authorities
- Provides complete ownership of attendance records through tamper-proof, on-chain verification
- Ensures the process is simple, secure, and resistant to fraud

## 🔧 Technical Solution

### Core Features
- **Time-bound challenges**: 6-character codes displayed in class, changing every 5 seconds
- **Soulbound tokens**: Non-transferable attendance credentials minted on-chain
- **Privacy-preserving**: No personal data shared, only cryptographic proofs
- **Fraud-resistant**: Time-sensitive codes prevent proxy attendance
- **Decentralized**: No central authority required

### Architecture
- **Smart Contracts**: Solidity contracts deployed on Sepolia testnet
- **Frontend**: React + TypeScript + Tailwind CSS
- **Web3 Integration**: Wagmi + Viem for Ethereum interactions
- **Token Standard**: ERC-721 with soulbound modifications

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- MetaMask or compatible wallet
- Sepolia ETH for gas fees

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd zkAttend
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd frontend
   npm install
   cd ..
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   SEPOLIA_RPC_URL=your_sepolia_rpc_url
   METAMASK_AC1_PRIVATE_KEY=your_private_key
   ```

4. **Deploy contracts**
   ```bash
   npx hardhat run scripts/redeploy-contracts.ts --network sepolia
   ```

5. **Update contract addresses**
   Update `frontend/src/config/contracts.ts` with the deployed contract addresses.

6. **Start the frontend**
   ```bash
   cd frontend
   npm run dev
   ```

## 📱 Usage

### For Teachers
1. Connect your wallet
2. Register as a teacher
3. Create a new class with name and date
4. Share the generated class code with students
5. Start attendance session to display changing codes
6. Stop attendance when done

### For Students
1. Connect your wallet
2. Enter the class code provided by teacher
3. View class details
4. When attendance starts, select the correct code from 4 options
5. Submit attendance to receive a soulbound token

## 🏗️ Project Structure

```
zkAttend/
├── contracts/                 # Smart contracts
│   ├── AttendanceSystem.sol   # Main attendance logic
│   └── AttendanceToken.sol    # Soulbound token contract
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── pages/            # Main pages (Teacher, Student, Home)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── utils/            # Utility functions
│   │   └── config/           # Configuration files
│   └── public/               # Static assets
├── scripts/                  # Deployment scripts
├── test/                     # Contract tests
└── ignition/                 # Hardhat Ignition deployments
```

## 🔐 Smart Contracts

### AttendanceSystem.sol
- Manages teacher registration
- Handles class creation and management
- Processes attendance verification
- Updates attendance codes
- Mints soulbound tokens

### AttendanceToken.sol
- ERC-721 implementation with soulbound modifications
- Prevents transfers and approvals
- Stores attendance metadata
- Minted only by the attendance system

## 🎨 Frontend Features

### Teacher Dashboard
- Wallet connection
- Teacher registration
- Class creation with unique codes
- Real-time attendance code generation
- Visual code display for classroom projection

### Student Dashboard
- Wallet connection
- Class joining via code
- Class details display
- Multiple choice attendance verification
- Success confirmation with token receipt

## 🔧 Development

### Available Scripts

**Root directory:**
- `npx hardhat compile` - Compile contracts
- `npx hardhat test` - Run tests
- `npx hardhat run scripts/redeploy-contracts.ts --network sepolia` - Deploy contracts

**Frontend directory:**
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Testing
```bash
# Test contracts
npx hardhat test

# Test frontend
cd frontend
npm test
```

## 🌐 Network Configuration

Currently deployed on **Sepolia testnet**:
- **AttendanceSystem**: `0x65748DDa0fe4CA768D434A7beBd43C49bf7F23A8`
- **AttendanceToken**: `0x9d00BB8d233FF9e2d04E66Fe9dFC503a372e0Af6`

## 🔒 Security Features

- **Time-bound verification**: Codes expire after 5 seconds
- **Soulbound tokens**: Cannot be transferred or sold
- **On-chain verification**: All attendance records are immutable
- **Privacy-preserving**: No personal data stored on-chain
- **Fraud prevention**: Time-sensitive codes prevent proxy attendance

## 🚧 Future Enhancements

- [ ] Integration with real-time communication (WebSocket)
- [ ] Mobile app development
- [ ] Batch attendance marking
- [ ] Analytics dashboard for teachers
- [ ] Integration with learning management systems
- [ ] Multi-chain support

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support or questions, please open an issue in the repository.

---

**Note**: This is a prototype deployed on Sepolia testnet. Do not use for production without proper security audits and mainnet deployment.