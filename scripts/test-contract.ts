import hre from "hardhat";

async function main() {
  console.log("Testing contract deployment...");

  const { viem } = await hre.network.connect({
    network: "sepolia",
    chainType: "l1",
  });

  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const contractAddress = "0x65748DDa0fe4CA768D434A7beBd43C49bf7F23A8";
  
  console.log("Testing contract at:", contractAddress);
  console.log("Deployer address:", deployer.account.address);

  try {
    // Test if contract exists
    const code = await publicClient.getBytecode({ address: contractAddress });
    console.log("Contract code exists:", code ? "Yes" : "No");
    
    if (code) {
      console.log("Contract is deployed and accessible");
      
      // Test a simple read function
      const AttendanceSystem = await viem.getContractAt("AttendanceSystem", contractAddress);
      
      // Try to read if deployer is registered as teacher
      const isTeacher = await AttendanceSystem.read.registeredTeachers([deployer.account.address]);
      console.log("Deployer is registered as teacher:", isTeacher);
      
    } else {
      console.log("Contract not found at address");
    }
  } catch (error) {
    console.error("Error testing contract:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
