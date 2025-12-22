// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AttendanceToken.sol";

contract AttendanceSystem {
    // State variables
    AttendanceToken public attendanceToken;
    
    struct Class {
        string name;
        address teacher;
        string uniqueCode;
        uint256 date;
        bool isActive;
        mapping(address => bool) attendees;
        // Legacy manual update fields (still supported)
        string currentAttendanceCode;
        uint256 codeTimestamp;
    }
    
    // Mappings
    mapping(address => bool) public registeredTeachers;
    mapping(string => Class) public classes;  // uniqueCode => Class
    mapping(address => string[]) public teacherClasses; // teacher => their class codes
    mapping(address => string[]) public studentClasses; // student => attended class codes
    
    // Finalization 
    mapping(string => bytes32) public classRoot; // Merkle root of attendees
    mapping(string => uint32) public classTotal; // number of attendees committed
    mapping(string => bytes32) public classContentHash; // optional IPFS/content hash
    mapping(string => bool) public classFinalized; // whether finalized
    mapping(string => string) public classCid; // IPFS CID of finalized attendee list
    mapping(string => mapping(address => bool)) public claimed; // claim status per class
    
    // Events
    event TeacherRegistered(address teacher);
    event ClassCreated(string uniqueCode, string name, address teacher, uint256 date);
    event AttendanceMarked(string uniqueCode, address student);
    event AttendanceCodeUpdated(string uniqueCode, string attendanceCode);
    event ClassFinalized(string uniqueCode, bytes32 root, uint32 total, bytes32 contentHash, string cid);
    event Claimed(string uniqueCode, address account);
    
    constructor(address _attendanceTokenAddress) {
        attendanceToken = AttendanceToken(_attendanceTokenAddress);
    }
    
    // Register as a teacher
    function registerTeacher() external {
        require(!registeredTeachers[msg.sender], "Already registered as teacher");
        registeredTeachers[msg.sender] = true;
        emit TeacherRegistered(msg.sender);
    }
    
    // Create a new class session
    function createClass(
        string memory _name,
        string memory _uniqueCode,
        uint256 _date
    ) external {
        require(registeredTeachers[msg.sender], "Not registered as teacher");
        require(classes[_uniqueCode].teacher == address(0), "Class code already exists");
        
        Class storage newClass = classes[_uniqueCode];
        newClass.name = _name;
        newClass.teacher = msg.sender;
        newClass.uniqueCode = _uniqueCode;
        newClass.date = _date;
        newClass.isActive = true;
        
        teacherClasses[msg.sender].push(_uniqueCode);
        
        emit ClassCreated(_uniqueCode, _name, msg.sender, _date);
    }
    
    // Update attendance code (called by teacher)
    function updateAttendanceCode(
        string memory _uniqueCode,
        string memory _attendanceCode
    ) external {
        require(registeredTeachers[msg.sender], "Not registered as teacher");
        require(classes[_uniqueCode].teacher == msg.sender, "Not the class teacher");
        require(classes[_uniqueCode].isActive, "Class is not active");
        Class storage class_ = classes[_uniqueCode];
        class_.currentAttendanceCode = _attendanceCode;
        class_.codeTimestamp = block.timestamp;
        
        emit AttendanceCodeUpdated(_uniqueCode, _attendanceCode);
    }
    
    // Finalize the class with a Merkle root of attendees (teacher-only)
    function finalizeClass(
        string memory _uniqueCode,
        bytes32 _root,
        uint32 _total,
        bytes32 _contentHash,
        string memory _cid
    ) external {
        require(registeredTeachers[msg.sender], "Not registered as teacher");
        require(classes[_uniqueCode].teacher == msg.sender, "Not the class teacher");
        require(classes[_uniqueCode].isActive, "Class is not active");
        require(!classFinalized[_uniqueCode], "Already finalized");
    require(bytes(_cid).length != 0, "CID required");
        classRoot[_uniqueCode] = _root;
        classTotal[_uniqueCode] = _total;
        classContentHash[_uniqueCode] = _contentHash;
        classFinalized[_uniqueCode] = true;
        classCid[_uniqueCode] = _cid;
        // freeze the class so manual updates stop
        classes[_uniqueCode].isActive = false;
        emit ClassFinalized(_uniqueCode, _root, _total, _contentHash, _cid);
    }

    function getFinalization(string memory _uniqueCode) external view returns (
        bytes32 root,
        uint32 total,
        bytes32 contentHash,
        bool finalized,
        string memory cid
    ) {
        return (
            classRoot[_uniqueCode],
            classTotal[_uniqueCode],
            classContentHash[_uniqueCode],
            classFinalized[_uniqueCode],
            classCid[_uniqueCode]
        );
    }

    // Claim attendance after finalization (student self-claims)
    function claim(
        string memory _uniqueCode,
        address account,
        bytes32[] calldata proof
    ) external {
        require(classFinalized[_uniqueCode], "Not finalized");
        require(account == msg.sender, "Only self-claim");
        require(!claimed[_uniqueCode][account], "Already claimed");
        bytes32 leaf = keccak256(abi.encodePacked(block.chainid, address(this), _uniqueCode, account));
        require(_verify(proof, classRoot[_uniqueCode], leaf), "Invalid proof");

        claimed[_uniqueCode][account] = true;
        // Mint attendance token
        Class storage class_ = classes[_uniqueCode];
        attendanceToken.mintAttendance(account, class_.name, class_.teacher);
        emit Claimed(_uniqueCode, account);
    }

    function _verify(bytes32[] memory proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            if (computed <= p) {
                computed = keccak256(abi.encodePacked(computed, p));
            } else {
                computed = keccak256(abi.encodePacked(p, computed));
            }
        }
        return computed == root;
    }

    
    // Mark attendance (called by student)
    function markAttendance(
        string memory _uniqueCode,
        string memory _submittedCode
    ) external {
        Class storage class_ = classes[_uniqueCode];
        require(class_.isActive, "Class is not active");
        require(!class_.attendees[msg.sender], "Already marked attendance");
        // Validate against manually set code within 5 seconds window
        require(
            keccak256(abi.encodePacked(class_.currentAttendanceCode)) == keccak256(abi.encodePacked(_submittedCode)),
            "Invalid attendance code"
        );
        require(block.timestamp <= class_.codeTimestamp + 5, "Attendance code expired");
        
        class_.attendees[msg.sender] = true;
        studentClasses[msg.sender].push(_uniqueCode);
        
        // Mint attendance token
        attendanceToken.mintAttendance(msg.sender, class_.name, class_.teacher);
        
        emit AttendanceMarked(_uniqueCode, msg.sender);
    }
    
    // Get class details
    function getClassDetails(string memory _uniqueCode) external view returns (
        string memory name,
        address teacher,
        uint256 date,
        bool isActive
    ) {
        Class storage class_ = classes[_uniqueCode];
        return (
            class_.name,
            class_.teacher,
            class_.date,
            class_.isActive
        );
    }
    
    // Check if student has attended a class
    function hasAttended(string memory _uniqueCode, address _student) external view returns (bool) {
        return classes[_uniqueCode].attendees[_student];
    }
    
    // Get teacher's classes
    function getTeacherClasses(address _teacher) external view returns (string[] memory) {
        return teacherClasses[_teacher];
    }
    
    // Get student's attended classes
    function getStudentClasses(address _student) external view returns (string[] memory) {
        return studentClasses[_student];
    }
}