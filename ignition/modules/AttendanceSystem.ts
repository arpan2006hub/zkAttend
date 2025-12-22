import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AttendanceDeployment", (m) => {
  const attendanceToken = m.contract("AttendanceToken");
  
  const attendanceSystem = m.contract("AttendanceSystem", [attendanceToken]);
  // Grant minting rights to AttendanceSystem so it can mint on student claims
  m.call(attendanceToken, "setMinter", [attendanceSystem]);
  
  return { attendanceToken, attendanceSystem };
});