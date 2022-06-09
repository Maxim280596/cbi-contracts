// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./interfaces/IUniswapV2Router.sol";
import "./helpers/Rescue.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CBI_Treasury is Ownable, Rescue {
    using SafeERC20 for IERC20;
    using Address for address;

    IUniswapV2Router public swapRouter;
    IERC20 public cbiToken;
    IERC20 public usdtToken;
    address public admin; // contract admin address

    event PurchaseCBI(
        uint256 indexed usdtAmount,
        uint256 indexed cbiAmount,
        address user
    );
    event SellCBI(
        uint256 indexed cbiAmount,
        uint256 indexed usdtAmount,
        address user
    );
    event WithdrawCBI(
        uint256 indexed cbiAmount,
        address user
    );
    event UpdateAdmin(address newAdmin);

    constructor(
        address _swapRouter, // SpookySwapRouter address
        address _cbiToken,   // CBI token address
        address _usdtToken,  // USDT token address
        address _admin      // admin address
    ) {
        require(Address.isContract(_swapRouter), "CBI_Treasury: Not contract");
        require(Address.isContract(_cbiToken), "CBI_Treasury: Not contract");
        require(Address.isContract(_usdtToken), "CBI_Treasury: Not contract");
        require(_admin != address(0), "CBI_Treasury: Null address");

        swapRouter = IUniswapV2Router(_swapRouter);
        cbiToken = IERC20(_cbiToken);
        usdtToken = IERC20(_usdtToken);
        admin = _admin;

        IERC20(_cbiToken).safeApprove(_swapRouter, type(uint256).max);
        IERC20(_usdtToken).safeApprove(_swapRouter, type(uint256).max);
    }

    receive() external payable {}

    modifier onlyAdmin {
        require(msg.sender == admin || msg.sender == owner(), "Ownable: Caller is not the admin");
        _;
    }

//==================================== CBI_Treasury view functions ==============================================================
    
    /**
    @dev Public view function returns the balance of the USDT token on this contract.
    */
    function usdtBalance() public view returns (uint256) {
        return usdtToken.balanceOf(address(this));
    }

    /**
    @dev Public view function returns the balance of the CBI token on this contract.
    */
    function cbiBalance() public view returns (uint256) {
        return cbiToken.balanceOf(address(this));
    }


//==================================== CBI_Treasury internal functions ==============================================================
    /**
    @dev The function performs the purchase of CBI tokens by exchanging USDT token for CBI. 
    On SpookySwapRouter.
    @param amount USDT token amount.
    */
    function _purchaseCBI(uint256 amount) internal {
        require(amount > 0, "CBI_Treasury: Zero amount USDT");
        require(usdtBalance() >= amount, "CBI_Treasury: Not enough balance USDT");
        address[] memory path = new address[](2);
        path[0] = address(usdtToken);
        path[1] = address(cbiToken);

        uint256[] memory swapAmounts = swapRouter.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );

        emit PurchaseCBI(amount, swapAmounts[1], msg.sender);
    }
    
    /**
    @dev Helper internal function for withdrawing user CBI tokens from Treasury contract.
    @param user user wallet address.
    @param amount CBI token amount.
    */
    function _withdrawCBI(
        address user,
        uint256 amount
    ) internal {
        require(amount > 0, "CBI_Treasury: Zero amount");
        require(cbiBalance() >= amount, "CBI_Treasury: Not enough balance CBI");

        cbiToken.safeTransfer(user, amount);
        emit WithdrawCBI(amount, user);
    }

    /**
    @dev The function exchanges the CBI token for USDT.
    @param amount CBI token swap amount.
    */
    function _sellCBI(address user, uint256 amount) internal  {
        require(amount > 0, "CBI_Treasury: Zero amount CBI");
        require(cbiBalance() >= amount, "CBI_Treasury: Not enough balance CBI");
        address[] memory path = new address[](2);
        path[0] = address(cbiToken);
        path[1] = address(usdtToken);

        uint256[] memory swapAmounts = swapRouter.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );

        emit SellCBI(amount, swapAmounts[1], user);
    }

    // ============================================ Owner & Admin functions ===============================================
    /**
    @dev The function performs the purchase of CBI tokens by exchanging USDT token for CBI. 
    On SpookySwapRouter.Only the owner or admin can call.
    @param amount USDT token amount.
    */
    function purchaseCBI(uint256 amount) external onlyAdmin {
        _purchaseCBI(amount);
    }
    /**
    @dev Reserve external function for withdrawing user CBI tokens from the  Treasury. 
    Only the owner or admin can call.
    @param user user wallet address.
    @param amount CBI token amount.
    */
    function withdrawCBI(
        address user,
        uint256 amount
    ) external onlyAdmin {
        _withdrawCBI(user, amount);
    }

    function sellCBI(
        address user,
        uint256 amount
    ) external onlyAdmin {
        _sellCBI(user, amount);
    }

    /**
    @dev Reserve function for rescue others tokens. Only the admin or owner can call.
    @param amount token amount.
    @param tokenAddress token address.
    @param to address for withdrawal.
    */
    function rescue(address to, address tokenAddress, uint256 amount) external override onlyAdmin {
        require(
            to != address(0),
            "CBI_Rescue: Cannot rescue to the zero address"
        );
        require(amount > 0, "CBI_Rescue: Cannot rescue 0");

        IERC20(tokenAddress).safeTransfer(to, amount);
        emit RescueToken(to, address(tokenAddress), amount);
    }

    /**
    @dev function performs contract administrator updates. 
    Only the owner can call.
    @param newAdmin new admin wallet address.
    */
    function updateAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "CBI_Treasury: Null address");
        require(newAdmin != admin, "CBI_Treasury: new admin equal to the current admin");
        admin = newAdmin;
        emit UpdateAdmin(newAdmin);
    }
}
