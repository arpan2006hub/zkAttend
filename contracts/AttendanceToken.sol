// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AttendanceToken is ERC721, Ownable {
    // Counter for token IDs
    uint256 private _tokenIdCounter;
    
    // Address allowed to mint (e.g., AttendanceSystem contract)
    address public minter;
    
    // Mapping from token ID to class details
    mapping(uint256 => ClassAttendance) public attendanceRecords;
    
    struct ClassAttendance {
        string className;
        uint256 date;
        address teacher;
    }

    constructor() ERC721("Attendance Credential", "ATTEND") Ownable(msg.sender) {}

    // Owner can set the authorized minter (AttendanceSystem)
    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    function mintAttendance(
        address to,
        string memory className,
        address teacher
    ) external returns (uint256) {
        // Only the authorized minter (AttendanceSystem) can mint
        require(msg.sender == minter, "Only minter can mint attendance");
        
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);
        
        attendanceRecords[tokenId] = ClassAttendance({
            className: className,
            date: block.timestamp,
            teacher: teacher
        });

        return tokenId;
    }

    // Disable transfers to make tokens soulbound
    function approve(address to, uint256 tokenId) public virtual override {
        revert("Token is Soulbound - no approvals");
    }

    function setApprovalForAll(address operator, bool approved) public virtual override {
        revert("Token is Soulbound - no approvals");
    }

    function transferFrom(address from, address to, uint256 tokenId) public virtual override {
        revert("Token is Soulbound - no transfers");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public virtual override {
        revert("Token is Soulbound - no transfers");
    }

    // Function to get attendance details
    function getAttendanceDetails(uint256 tokenId) external view returns (
        string memory className,
        uint256 date,
        address teacher
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        ClassAttendance memory attendance = attendanceRecords[tokenId];
        return (attendance.className, attendance.date, attendance.teacher);
    }
}