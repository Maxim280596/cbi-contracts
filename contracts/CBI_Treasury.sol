// SPDX-License-Identifier: MIT

pragma solidity 0.8.14;

import "./interfaces/IUniswapV2Router.sol";
// import "./helpers/Rescue.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CBI_Treasury is Ownable {
    using SafeERC20 for IERC20;
    using Address for address;

    IUniswapV2Router public swapRouter;

     //Enum of farm types
    enum TrxStatus {
        Pending,
        Confirmed,
        Rejected
    }

    enum TrxType {
        Withdraw,
        SwapTokens,
        UpdateToken
    }

    address cbiToken; // cbi token
    address usdtToken; // usdt token
    address public admin; // contract admin address
    uint256 public quorum;
    address[] public admins;
    uint256 public withdrawTrxCounter;
    uint256 public trxCounter;

    struct Token {
        bool allowed;
        uint swapLimit;
        uint withdrawLimit;
        address tokenAddress;
    }

    struct MultiSigTransaction {
        uint trxType;
        uint trxId;
        string trxArguments;
        uint confirmations;
        uint rejects;
        uint trxTimestamp;
    }

    struct WithdrawTrx {
        address token;
        uint256 amount;
        address recipient;
    }

    struct SwapTrx {
        address inputToken; 
        address outputToken;
        uint256 amount;
        address user;
        string userId;
    }

    struct UpdateTokenTrx {
        address token; 
        bool allowed;
        uint swapLimit;
        uint withdrawLimit;
        address newAdmin;
    }

    struct TrxArgs {
        address token; 
        bool allowed;
        uint swapLimit;
        uint withdrawLimit;
        address newAdmin;
        address inputToken; 
        address outputToken;
        uint256 amount;
        address user;
        string userId;
    }


    struct TrxData {
        uint256 trxId;
        uint256 confirmations;
        uint256 rejects;
        TrxStatus status;
        address creator;
        uint256 trxTimestamp;
        address[] votes;
        WithdrawTrx withdrawArgs;
        SwapTrx swapTokensArgs;
        UpdateTokenTrx updateArgs;
    }

    mapping(uint256 => WithdrawTrx) public withdrawTrxData;
    mapping(uint256 => TrxData) public trxData;
    mapping(address => Token) public allowedTokensInfo; // allowed tokens in the treasury
    mapping(address => uint256) public withdrawNonces; // withdrawal nonces
    mapping(address => uint256) public swapNonces; // swap nonces


    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public immutable WITHDRAW_TYPEHASH =
        keccak256(
            "WithdrawBySign(address token,uint amount,address user,string userId,address sender,uint256 nonce,uint256 deadline)"
        );
    bytes32 public immutable SWAP_TYPEHASH =
        keccak256(
            "SwapTokensBySign(address inputToken,address outputToken,uint amount,address user,string userId,address sender,uint256 nonce,uint256 deadline)"
        );

    event SwapTokens(
        address inputToken,
        address outputToken,
        uint256 indexed inputAmount,
        uint256 indexed outputAmount,
        address user,
        string indexed userId
    );
    event Replenish(
        address indexed token,
        uint256 indexed amount,
        address user,
        string indexed userId
    );
    event Withdraw(
        address indexed token,
        uint256 indexed amount,
        address user,
        string indexed userId
    );
    event WithdrawMultiSig(
        address indexed token,
        uint256 indexed amount,
        address  indexed recipient
    );
    event UpdateAdmin(address newAdmin);
    event UpdateAllowedToken(
        address token, 
        uint indexed swapLimit, 
        uint indexed withdrawLimit, 
        bool indexed allowed
    );
    event RescueToken(address to, address token, uint256 amount);
    event RescueFTM(address to, uint256 amount);

    constructor(
        address _swapRouter, // SpookySwapRouter address
        address _cbiToken,   // CBI token address
        address _usdtToken,  // USDT token address
        address _admin,      // admin address
        address[] memory _admins,
        uint256 _quorum
    ) {
        require(Address.isContract(_swapRouter), "CBI_Treasury: Not contract");
        require(Address.isContract(_cbiToken), "CBI_Treasury: Not contract");
        require(Address.isContract(_usdtToken), "CBI_Treasury: Not contract");
        require(_admin != address(0), "CBI_Treasury: Null address");
        require(_admins.length > 0, "Zero length");
        require(_quorum > 0, "Mast greate");

        for(uint i; i <= _admins.length; i++) {
            require(_admins[i] != address(0), "admins zero address");
        }
        admins = _admins;
        quorum = _quorum;
        swapRouter = IUniswapV2Router(_swapRouter);
        
        cbiToken = _cbiToken;
        usdtToken = _usdtToken;
        admin = _admin;

        Token storage usdtTokenInfo = allowedTokensInfo[_usdtToken];
        Token storage cbiTokenInfo = allowedTokensInfo[_cbiToken];

        usdtTokenInfo.allowed = true;
        usdtTokenInfo.swapLimit = 0;
        usdtTokenInfo.withdrawLimit = 0;
        usdtTokenInfo.tokenAddress = usdtToken;

        cbiTokenInfo.allowed = true;
        cbiTokenInfo.swapLimit = 0;
        cbiTokenInfo.withdrawLimit = 0;
        cbiTokenInfo.tokenAddress = cbiToken;

        uint256 chainId = block.chainid;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("CBI_Treasury")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );

        IERC20(_cbiToken).safeApprove(_swapRouter, type(uint256).max);
        IERC20(_usdtToken).safeApprove(_swapRouter, type(uint256).max);
    }

    receive() external payable {}

    modifier onlyAdmin {
        require(msg.sender == admin || msg.sender == owner(), "Ownable: Caller is not the admin");
        _;
    }

    modifier onlyQuorum {
        bool exist = false;
        for (uint256 i; i <= admins.length; i++ ) {
            if(msg.sender == admins[i]){
              exist = true;
              break;  
            } 
        }
        require(exist, "CBI_Treasury: Caller is not the admin");
        _;
    }

    //==================================== CBI_Treasury external functions ==============================================================

    /**
    @dev The function performs the replenishment allowed tokens on this contract.
    @param userId user ID in CBI system.
    @param amount token amount.
    */
    function replenish(address token, uint256 amount, string memory userId) external {
        require(amount > 0, "CBI_Treasury: Zero amount");
        Token storage tokenInfo = allowedTokensInfo[token];
        require(tokenInfo.allowed, "CBI_Treasury: Not allowed token");
       
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Replenish(token, amount, msg.sender, userId);
    }
   
    /**
    @dev The function performs the purchase or sell allowed tokens by exchanging. 
    On SpookySwapRouter. 
    This function uses the EIP-712 signature standard.
    */
    function swapTokensBySign(
        address inputToken,
        address outputToken,
        uint256 amount,
        address user,
        string memory userId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline > block.timestamp, "CBI_Treasury: Expired");
        uint256 nonce = swapNonces[msg.sender]++;

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        SWAP_TYPEHASH,
                        inputToken,
                        outputToken,
                        amount,
                        user,
                        keccak256(bytes(userId)),
                        msg.sender,
                        nonce,
                        deadline
                    )
                )
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);
        require(
            recoveredAddress != address(0) && (recoveredAddress == admin || recoveredAddress == owner()),
            "CBI_Treasury: INVALID_SIGNATURE"
        );

        _swapTokens(inputToken, outputToken, amount, user, userId);
    }

    /**
    @dev Function for withdraw allowed tokens from Treasury contract. 
    This function uses the EIP-712 signature standard.
    */
    function withdrawBySign(
        address token,
        uint256 amount,
        address user, 
        string calldata userId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline > block.timestamp, "CBI_Treasury: Expired");
        uint256 nonce = withdrawNonces[msg.sender]++;

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        WITHDRAW_TYPEHASH,
                        token,
                        amount,
                        user,
                        keccak256(bytes(userId)),
                        msg.sender,
                        nonce,
                        deadline
                    )
                )
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);
        require(
            recoveredAddress != address(0) && (recoveredAddress == admin || recoveredAddress == owner()),
            "CBI_Treasury: INVALID_SIGNATURE"
        );

        _withdraw(token, amount, user, userId);
    }

//==================================== CBI_Treasury view functions ==============================================================
    
    /**
    @dev Public view function returns the balance of the USDT token on this contract.
    */
    function usdtBalance() public view returns (uint256) {
        return IERC20(usdtToken).balanceOf(address(this));
    }

    /**
    @dev Public view function returns the balance of the CBI token on this contract.
    */
    function cbiBalance() public view returns (uint256) {
        return IERC20(cbiToken).balanceOf(address(this));
    }


//==================================== CBI_Treasury internal functions ==============================================================
    /**
    @dev The function performs the purchase or sell allowed tokens by exchanging tokens 
    on SpookySwapRouter.
    @param inputToken Sell token
    @param outputToken Purchase token
    @param amount USDT token amount.
    @param user recipient wallet address
    @param userId recipient user ID in CBI system.
    */
    function _swapTokens(address inputToken, address outputToken, uint256 amount, address user, string memory userId) internal {
        require(amount > 0, "CBI_Treasury: Zero amount");
        Token storage inputTokenInfo = allowedTokensInfo[inputToken];
        Token storage outputTokenInfo = allowedTokensInfo[outputToken];
        require(inputTokenInfo.allowed && outputTokenInfo.allowed, "CBI_Treasury: Not allowed token");
        uint balanceInputToken = IERC20(inputToken).balanceOf(address(this));
        require(balanceInputToken >= amount, "CBI_Treasury: Not enough token balance");
        require(balanceInputToken - amount >= inputTokenInfo.swapLimit, "CBI_Treasury: Token swap limit exceeded");
        
         address[] memory path = new address[](2);
         path[0] = inputToken;
         path[1] = outputToken;

        uint256[] memory swapAmounts = swapRouter.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );
        emit SwapTokens(inputToken, outputToken, amount, swapAmounts[1], user, userId);
    }



    
    /**
    @dev Helper internal function for withdrawing allowed tokens from Treasury contract.
    @param token withdraw token address
    @param amount withdraw token amount.
    @param user user wallet address.
    @param userId user ID in CBI system.
    */
    function _withdraw(
        address token,
        uint256 amount,
        address user,
        string memory userId
    ) internal {
        Token storage tokenInfo = allowedTokensInfo[token];
        require(tokenInfo.allowed, "CBI_Treasury: Not allowed token");
        require(amount > 0, "CBI_Treasury: Zero amount");
        uint balanceToken = IERC20(token).balanceOf(address(this));        
        require(balanceToken >= amount, "CBI_Treasury: Not enough token balance");
        require(balanceToken - amount >= tokenInfo.withdrawLimit, "CBI_Treasury: Token withdraw limit exceeded");

        IERC20(token).safeTransfer(user, amount);
        emit Withdraw(token,amount, user, userId);
    }

    function _withdrawMultiSig(address token, uint256 amount, address recipient) internal {
        require(amount > 0, "CBI_Treasury: Zero amount");
        require(token != address(0) && recipient != address(0), "CBI_Treasury: Zero amount");
        require(IERC20(token).balanceOf(address(this)) >= amount, "CBI_Treasury: Not enough token balance");

        IERC20(token).safeTransfer(recipient, amount);
        emit WithdrawMultiSig(token, amount, recipient);
    }


    // ============================================ Owner & Admin functions ===============================================
    /**
    @dev The function performs the purchase or sell allowed tokens by exchanging 
    On SpookySwapRouter.Only the owner or admin can call.
    @param amount USDT token amount.
    @param userId user ID in CBI system.
    */
    function swapTokens(address inputToken, address outputToken, uint256 amount, address user, string memory userId) external onlyAdmin {
        _swapTokens(inputToken, outputToken, amount, user, userId);
    }

    /**
    @dev Reserve external function for withdrawing allowed tokens from the  Treasury. 
    Only the owner or admin can call.
    @param user user wallet address.
    @param amount CBI token amount.
    @param userId user ID in CBI system.
    */
    function withdraw(
        address token,
        uint256 amount,
        address user,
        string calldata userId
    ) external onlyAdmin {
        _withdraw(token, amount, user, userId);
    }

    function createMultiSigTrx( uint256 trxTypeIndex, TrxArgs memory args) external onlyQuorum {
        TrxType trxType = TrxType(trxTypeIndex);
        TrxData storage trxInfo = trxData[trxCounter];
        

        if(trxType == TrxType.Withdraw) {

            WithdrawTrx memory withdrawTrx = WithdrawTrx({
                amount: args.amount,
                recipient: args.user,
                token: args.token
            });
                
            trxInfo.withdrawArgs = withdrawTrx;

        } else if(trxType == TrxType.SwapTokens) {
            SwapTrx memory swapTrx = SwapTrx({
                inputToken: args.inputToken,
                outputToken: args.outputToken,
                amount: args.amount,
                user: args.user,
                userId: args.userId
            });

            trxInfo.swapTokensArgs = swapTrx;

        } else if(trxType == TrxType.UpdateToken) {

             UpdateTokenTrx memory updateTokenTrx = UpdateTokenTrx({
                token: args.token,
                allowed: args.allowed,
                swapLimit: args.swapLimit,
                withdrawLimit: args.withdrawLimit,
                newAdmin: args.newAdmin
             });
                       
            trxInfo.updateArgs = updateTokenTrx;
        }

        trxInfo.confirmations += 1;
        trxInfo.votes.push(msg.sender);
        trxInfo.trxId = trxCounter;
        trxInfo.creator = msg.sender;
        trxInfo.status = TrxStatus.Pending;
        trxInfo.trxTimestamp = block.timestamp;
        trxCounter++;
        
    }

    function isVoted (uint256 trxId) public view returns (bool) {
        TrxData storage trxInfo = trxData[trxId];

        bool voted = false;
        for (uint256 i; i <= trxInfo.votes.length; i++ ) {
            if(msg.sender == trxInfo.votes[i]){
              voted = true;
              break;  
            } 
        }
        return voted;
    }

    // function _createWithdrawTrx(address token, uint256 amount, address recipient) internal {
    //         WithdrawTrx storage trxData = withdrawTrxData[withdrawTrxCounter];
    //         trxData.token = token;
    //         trxData.amount = amount;
    //         trxData.recipient = recipient;
    //         trxData.trxId = withdrawTrxCounter;
    //         trxData.creator = msg.sender;
    //         trxData.trxTimestamp = block.timestamp;
    //         trxData.confirmations += 1;
    //         trxData.status = TrxStatus.Pending;
    // }

    function _addConfirmation(uint256 trxId) internal {
        TrxData storage trxInfo = trxData[trxId];
        trxInfo.confirmations += 1;
    }

    function _rejectTrx(uint256 trxId) internal {
        TrxData storage trxInfo = trxData[trxId];
        trxInfo.rejects += 1;
    }

    function withdrawMultiSig(uint256 trxId, bool confirm) external onlyQuorum {
        TrxData storage trxInfo = trxData[trxId];
        require(trxInfo.status == TrxStatus.Pending, "trx end");
        require(!isVoted(trxId), "You add vote");
        

        if(confirm) {
            _addConfirmation(trxId);
        } else {
            _rejectTrx(trxId);
        }

        if(trxInfo.confirmations == quorum) {
            trxInfo.status = TrxStatus.Confirmed;
           _withdrawMultiSig(trxInfo.withdrawArgs.token, trxInfo.withdrawArgs.amount, trxInfo.withdrawArgs.recipient);
        }


        if((admins.length - trxInfo.rejects < quorum)) {
            trxInfo.status = TrxStatus.Rejected;
        }

        
    }

    /** 
    @dev Function performs contract administrator updates. 
    Only the owner can call.
    @param newAdmin new admin wallet address.
    */
    function updateAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "CBI_Treasury: Null address");
        require(newAdmin != admin, "CBI_Treasury: new admin equal to the current admin");
        admin = newAdmin;
        emit UpdateAdmin(newAdmin);
    }

    /** 
    @dev The function performs updates or adds new allowed tokens.
    The function also configures the token.
    Gives permission to use on the platform, changes the withdrawal limit and the swap limit
    Only the owner can call.
    @param token token address.
    @param allowed permission to use on the platform
    @param swapLimit limit for purchase or sell
    @param withdrawLimit limit for token withdraw
    */
    function updateAllowedToken(address token, bool allowed, uint swapLimit, uint withdrawLimit) external onlyAdmin {
        require(Address.isContract(token), "CBI_Treasury: Not contract");
        Token storage tokenInfo = allowedTokensInfo[token];
        if(tokenInfo.tokenAddress == address(0)) {
            IERC20(token).safeApprove(address(swapRouter), type(uint256).max);
            tokenInfo.tokenAddress = token;
        }
        
        tokenInfo.allowed = allowed;
        tokenInfo.swapLimit = swapLimit;
        tokenInfo.withdrawLimit = withdrawLimit;

        emit UpdateAllowedToken(token, swapLimit, withdrawLimit, allowed);
    }

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

        IERC20(tokenAddress).safeTransfer(to, amount);
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
