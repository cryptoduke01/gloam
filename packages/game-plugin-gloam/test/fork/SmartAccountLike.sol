// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// SmartAccountLike.runtime.hex is this contract's deployed bytecode:
//   forge inspect SmartAccountLike.sol:SmartAccountLike deployedBytecode   (solc 0.8.24, default settings)

/// Test double for an ERC-4337 smart account behind the EntryPoint: the outer
/// transaction always succeeds, the batch of calls reverts as a whole and the
/// revert is swallowed (like handleOps emitting UserOperationEvent(success=false)).
contract SmartAccountLike {
    struct Call { address to; uint256 value; bytes data; }
    event UserOp(bool success);
    function execute(Call[] calldata calls) external payable {
        (bool ok, ) = address(this).call(abi.encodeCall(this.inner, (calls)));
        emit UserOp(ok);
    }
    function inner(Call[] calldata calls) external {
        require(msg.sender == address(this), "self");
        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory r) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) assembly { revert(add(r, 32), mload(r)) }
        }
    }
    receive() external payable {}
}
