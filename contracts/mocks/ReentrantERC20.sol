// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal view of {AetherisAgency} used by the attacker fixture.
interface IReentrancyTarget {
    function refundJob(uint256 jobId) external returns (uint256);
}

/**
 * @title ReentrantERC20
 * @notice A hostile ERC-20 that calls back into {AetherisAgency} from inside a transfer,
 *         simulating an ERC-777-style hook or a malicious token in a job's escrow.
 * @dev TEST FIXTURE ONLY. It swallows the reentrant call's revert and records the raw revert
 *      data so tests can assert that {ReentrancyGuard} — and not some unrelated check — is
 *      what stopped the re-entry.
 */
contract ReentrantERC20 is ERC20 {
    /// @notice Agency contract to re-enter.
    address public target;
    /// @notice Job id passed to the reentrant call.
    uint256 public targetJobId;
    /// @notice One-shot arming flag so the fixture cannot recurse forever.
    bool public armed;
    /// @notice True once a re-entry has been attempted.
    bool public reentryAttempted;
    /// @notice True when the reentrant call reverted (the expected outcome).
    bool public reentryReverted;
    /// @notice Raw revert data from the reentrant call, for selector assertions.
    bytes public lastRevertData;

    constructor() ERC20("Reentrant Token", "REENT") {}

    /**
     * @notice Mints `amount` to `to`. Unrestricted by design.
     * @param to     Recipient.
     * @param amount Amount to mint.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Arms the attack so the next token movement re-enters `agency`.
     * @param agency Agency contract to call back into.
     * @param jobId  Job id to pass to `refundJob`.
     */
    function arm(address agency, uint256 jobId) external {
        target = agency;
        targetJobId = jobId;
        armed = true;
        reentryAttempted = false;
        reentryReverted = false;
        delete lastRevertData;
    }

    /// @dev Fires the re-entry on the first movement after {arm}.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (armed && target != address(0)) {
            armed = false; // one shot
            reentryAttempted = true;
            try IReentrancyTarget(target).refundJob(targetJobId) {
                reentryReverted = false;
            } catch (bytes memory reason) {
                reentryReverted = true;
                lastRevertData = reason;
            }
        }
    }
}
