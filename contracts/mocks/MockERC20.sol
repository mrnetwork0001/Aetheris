// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @notice Plain, freely-mintable ERC-20 used to exercise Aetheris' non-HTS settlement path.
 * @dev TEST FIXTURE ONLY — never deploy this to a live network.
 */
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    /**
     * @notice Deploys the mock token.
     * @param name_     Token name.
     * @param symbol_   Token symbol.
     * @param decimals_ Decimal precision.
     */
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mints `amount` to `to`. Unrestricted by design.
     * @param to     Recipient.
     * @param amount Amount to mint.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
