// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// TestAccount07.runtime.hex is this contract's deployed bytecode:
//   forge inspect TestAccount07.sol:TestAccount07 deployedBytecode   (solc 0.8.24, default settings)

struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

/// Test double for a smart account behind the ERC-4337 EntryPoint v0.7, for forks only: the
/// EntryPoint may run any call through it (no signature check) and it pays its own prefund.
/// The EntryPoint keeps the nonces; a call that reverts makes UserOperationEvent(success=false).
contract TestAccount07 {
    address constant ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function validateUserOp(PackedUserOperation calldata, bytes32, uint256 missingAccountFunds) external returns (uint256) {
        require(msg.sender == ENTRYPOINT, "entrypoint only");
        if (missingAccountFunds > 0) {
            (bool ok, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            ok;
        }
        return 0;
    }

    function execute(address to, uint256 value, bytes calldata data) external {
        require(msg.sender == ENTRYPOINT, "entrypoint only");
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {}
}
