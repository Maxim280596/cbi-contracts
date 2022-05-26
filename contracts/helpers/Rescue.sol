pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IERC20.sol";

contract Rescue is Ownable {
    event RescueToken(address to, address token, uint256 amount);
    event RescueFTM(address to, uint256 amount);

    constructor() {}

    /**
    @dev Reserve function for rescue others tokens. Only the owner can call.
    @param amount token amount.
    @param tokenAddress token address.
    @param to address for withdrawal.
    */
    function rescue(
        address to,
        address tokenAddress,
        uint256 amount
    ) external onlyOwner {
        require(
            to != address(0),
            "CBI_Rescue: Cannot rescue to the zero address"
        );
        require(amount > 0, "CBI_Rescue: Cannot rescue 0");

        IERC20(tokenAddress).transfer(to, amount);
        emit RescueToken(to, address(tokenAddress), amount);
    }

    /**
    @dev Reserve function for rescue FTM. Only the owner can call.
    @param amount FTM amount.
    @param to address for withdrawal.
    */
    function rescueFTM(address payable to, uint256 amount) external onlyOwner {
        require(
            to != address(0),
            "CBI_Rescue: Cannot rescue to the zero address"
        );
        require(amount > 0, "CBI_Rescue: Cannot rescue 0");

        to.transfer(amount);
        emit RescueFTM(to, amount);
    }

}
