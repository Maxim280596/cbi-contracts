// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CBI_ERC20 is ERC20, Ownable, Pausable {

    constructor(uint totalSupply_) ERC20("CBI", "CBI") {
        _mint(owner(), totalSupply_);
    } 

    /**
     * @dev See {IERC20-transfer}.
     */
    function transfer(address to, uint256 amount) public override whenNotPaused returns (bool) {
        address owner = msg.sender;
        _transfer(owner, to, amount);
        return true;
    }

    /**
     * @dev See {IERC20-approve}.
     */
    function approve(address spender, uint256 amount) public override whenNotPaused returns (bool) {
        address owner = msg.sender;
        _approve(owner, spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public whenNotPaused override returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

}