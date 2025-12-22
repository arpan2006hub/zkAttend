import { CONTRACT_ADDRESSES, ATTENDANCE_SYSTEM_ABI, ATTENDANCE_TOKEN_ABI } from '../config/contracts';

// Contract interaction utilities
export const contractUtils = {
  // Get contract address
  getAttendanceSystemAddress: () => CONTRACT_ADDRESSES.ATTENDANCE_SYSTEM,
  getAttendanceTokenAddress: () => CONTRACT_ADDRESSES.ATTENDANCE_TOKEN,
  
  // Get contract ABI
  getAttendanceSystemABI: () => ATTENDANCE_SYSTEM_ABI,
  getAttendanceTokenABI: () => ATTENDANCE_TOKEN_ABI,
  
  // Format date for contract (Unix timestamp)
  formatDateForContract: (date: Date): bigint => {
    return BigInt(Math.floor(date.getTime() / 1000));
  },
  
  // Format date from contract (Unix timestamp to Date)
  formatDateFromContract: (timestamp: bigint): Date => {
    return new Date(Number(timestamp) * 1000);
  },
  
  // Convert string to bytes32 for contract calls
  stringToBytes32: (str: string): `0x${string}` => {
    const bytes = new TextEncoder().encode(str);
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
  }
};
