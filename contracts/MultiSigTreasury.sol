// SPDX-License-Identifier: MIT

pragma solidity 0.8.14;

import "./interfaces/IUniswapV2Router.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MultiSigTreasury is Ownable, AccessControl {
    using SafeERC20 for IERC20;
    using Address for address;

    IUniswapV2Router public swapRouter;

    enum TrxStatus {
        Pending,
        Confirmed,
        Rejected
    } // enum multi sig trx status

    enum TrxType {
        Withdraw,
        SwapTokens
    } // enum multi sig trx type

    struct WithdrawTrx {
        address token;
        uint256 amount;
        address recipient;
        bool isFtm;
    } // withdraw trx arguments

    struct SwapTrx {
        address inputToken; 
        address outputToken;
        uint256 amount;
        address user;
    } // swapTokens trx arguments

    struct TrxData {
        uint256 trxId;
        uint256 confirmations;
        uint256 rejects;
        TrxType trxType;
        TrxStatus status;
        address creator;
        uint256 trxTimestamp;
        WithdrawTrx withdrawArgs;
        SwapTrx swapTokensArgs;
    } // multi sig trx info

    address public cbiToken; // cbi token
    address public usdtToken; // usdt token
    address[] public admins; // admins who have the right to vote

    uint256 public quorum; // multi sig quorum
    uint256 public trxCounter; // multi sig trx counter

    mapping(uint256 => TrxData) public trxData; // multi sig trx info
    mapping(uint => mapping(address => uint256)) public votes; // 0 - didnt vote;  1 - confirm; 2 - reject;

    bytes32 public constant VERIFIYER_ROLE = keccak256("VERIFIYER_ROLE");

    event SwapTokens(
        uint256 trxId, 
        address inputToken,
        address outputToken,
        uint256 indexed inputAmount,
        uint256 indexed outputAmount,
        address user
    );
    event Replenish(
        address indexed token,
        uint256 indexed amount,
        address user
    );
    event Withdraw(
       uint256 trxId, 
       address indexed token,
       uint256 indexed amount,
       address indexed recipient
    );

    event WithdrawFTM(
        uint256 trxId, 
        address to, 
        uint256 amount
    );

    event CreateWithdrawTrx(
       TrxData indexed withdrawTrx
    );

    event CreateSwapTrx(
       TrxData indexed swapTrx
    );

    event AddConfirmation(
        uint256 indexed trxId
    );

    event AddRejection(
        uint256 indexed trxId
    );

    event AddVerifiyer(
        address indexed newVerifiyer
    );
    event RemoveVerifiyer(
        address indexed verifiyer
    );
    event UpdateQuorum(
        uint256 indexed newQuorum
    );
    
    /**
    @dev A function that is called when the contract is deployed and sets the parameters to the state.
    @param _swapRouter spooky swap router address.
    @param _cbiToken cbi token address.
    @param _usdtToken usdt token address.
    @param _admins array fo admins addresses.
    @param _quorum the number of votes to make a decision.
    */
    constructor(
        address _swapRouter, // SpookySwapRouter address
        address _cbiToken,   // CBI token address
        address _usdtToken,  // USDT token address
        address[] memory _admins, // array of contract admins
        uint256 _quorum // multi sig quourum
    ) {
        require(Address.isContract(_swapRouter), "MultiSigTreasury: Not contract");
        require(Address.isContract(_cbiToken), "MultiSigTreasury: Not contract");
        require(Address.isContract(_usdtToken), "MultiSigTreasury: Not contract");
        require(_admins.length > 0, "MultiSigTreasury: Zero length");
        require(_quorum > 0, "MultiSigTreasury: Must be greater than zero");

        _grantRole(DEFAULT_ADMIN_ROLE, owner());

        for(uint i; i <= _admins.length - 1; i++) {
            require(_admins[i] != address(0), "MultiSigTreasury: Admin can`t be zero address");
            _setupRole(VERIFIYER_ROLE, _admins[i]);
        }
        admins = _admins;
        quorum = _quorum;
        swapRouter = IUniswapV2Router(_swapRouter);
        
        cbiToken = _cbiToken;
        usdtToken = _usdtToken;

        IERC20(_cbiToken).safeApprove(_swapRouter, type(uint256).max);
        IERC20(_usdtToken).safeApprove(_swapRouter, type(uint256).max);
    }

    /**
    @dev fallback function to obtain FTM per contract.
    */
    receive() external payable {}

//========================================== MultiSigTreasury external functions ======================================================================

    /**
    @dev The function performs the replenishment allowed tokens on this contract.
    @param token replenish token address.
    @param amount token amount.
    */
    function replenish(address token, uint256 amount) external {
        require(amount > 0, "MultiSigTreasury: Zero amount");
        require(token != address(0), "MultiSigTreasury: Zero address");
       
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Replenish(token, amount, msg.sender);
    }

    /**
    @dev The function creates a withdrawal vote and votes for the withdrawal from the admin who called it.
    Only verifiyers can call.
    @param token withdraw token address.
    @param amount token amount.
    @param recipient tokens recipient.
    @param isFtm true if token equal FTM else false
    */
    function createWithdrawTrx(address token, uint256 amount, address recipient, bool isFtm) external onlyRole(VERIFIYER_ROLE) {
        require(amount > 0,"MultiSigTreasury: Zero amount");
        require(recipient != address(0),"MultiSigTreasury: Zero address");
        if(!isFtm) {
            require(token != address(0),"MultiSigTreasury: Zero address");
            require(IERC20(token).balanceOf(address(this)) >= amount, "MultiSigTreasury: Not enough token balance");
        } else {
            require(address(this).balance >= amount, "MultiSigTreasury: Not enough token balance");
        }
        
        TrxData storage trxInfo = trxData[trxCounter];

        WithdrawTrx memory withdrawTrx = WithdrawTrx({
            amount: amount,
            recipient:recipient,
            token: token,
            isFtm: isFtm
        });
                
        trxInfo.withdrawArgs = withdrawTrx;

        trxInfo.trxType = TrxType.Withdraw;
        trxInfo.confirmations += 1;
        votes[trxCounter][msg.sender] = 1;
        trxInfo.trxId = trxCounter;
        trxInfo.creator = msg.sender;
        trxInfo.status = TrxStatus.Pending;
        trxInfo.trxTimestamp = block.timestamp;
        trxCounter++;

        emit CreateWithdrawTrx(trxInfo);
        
    }

    /**
    @dev The function creates a swap vote and votes for the swap tokens from the admin who called it.
    Only verifiyers can call.
    @param inputToken token that we exchange.
    @param outputToken the token we will receive.
    @param amount input token amount.
    @param user user address
    */
    function createSwapTokensTrx(address inputToken, address outputToken, uint256 amount, address user) external onlyRole(VERIFIYER_ROLE){
        require(amount > 0, "MultiSigTreasury: Zero amount");
        require(inputToken != address(0), "MultiSigTreasury: Zero address");
        require(outputToken != address(0), "MultiSigTreasury: Zero address");
        uint balanceInputToken = IERC20(inputToken).balanceOf(address(this));
        require(balanceInputToken >= amount, "MultiSigTreasury: Not enough token balance");

        TrxData storage trxInfo = trxData[trxCounter];
        SwapTrx memory swapTrx = SwapTrx({
                inputToken: inputToken,
                outputToken: outputToken,
                amount: amount,
                user: user
             });
                       
        trxInfo.swapTokensArgs = swapTrx;
        trxInfo.trxType = TrxType.SwapTokens;
        trxInfo.confirmations += 1;
        votes[trxCounter][msg.sender] = 1;
        trxInfo.trxId = trxCounter;
        trxInfo.creator = msg.sender;
        trxInfo.status = TrxStatus.Pending;
        trxInfo.trxTimestamp = block.timestamp;
        trxCounter++;

        emit CreateSwapTrx(trxInfo);
    }

    /**
    @dev the function conducts voting for the withdrawal of tokens, 
    with each call it counts the vote and as soon as the decisive vote is cast, 
    the withdrawal will be called, or the transaction will be canceled.
    Only verifiyers can call.
    @param trxId withdraw transaction id.
    @param confirm for or against.
    */
    function withdrawVote(uint256 trxId, bool confirm) external  onlyRole(VERIFIYER_ROLE) {
        require(trxId < trxCounter, "MultiSigTreasury: Transaction not created");
        TrxData storage trxInfo = trxData[trxId];
        require(trxInfo.status == TrxStatus.Pending, "MultiSigTreasury: Transaction completed");
        require(!isVoted(trxId), "MultiSigTreasury: You have already voted");
        
        if(confirm) {
            _addConfirmation(trxId);
        } else {
            _rejectTrx(trxId);
        }

        if(trxInfo.confirmations == quorum) {
            trxInfo.status = TrxStatus.Confirmed;
            if(!trxInfo.withdrawArgs.isFtm) {
              _withdraw(trxId,trxInfo.withdrawArgs.token, trxInfo.withdrawArgs.amount, trxInfo.withdrawArgs.recipient);  
            } else {
                _withdrawFTM(trxId, payable(trxInfo.withdrawArgs.recipient), trxInfo.withdrawArgs.amount);
            }
           
        }

        if((admins.length - trxInfo.rejects < quorum)) {
            trxInfo.status = TrxStatus.Rejected;
        }        
    }


    /**
    @dev the function conducts voting for the swap of tokens, 
    with each call it counts the vote and as soon as the decisive vote is cast, 
    the swapTOkens will be called, or the transaction will be canceled.
    Only verifiyers can call.
    @param trxId swapTokens transaction id.
    @param confirm for or against.
    */
    function swapTokensVote(uint256 trxId, bool confirm) external onlyRole(VERIFIYER_ROLE) {
        require(trxId < trxCounter, "MultiSigTreasury: Transaction not created");
        TrxData storage trxInfo = trxData[trxId];
        require(trxInfo.status == TrxStatus.Pending, "MultiSigTreasury: Transaction completed");

        require(!isVoted(trxId), "MultiSigTreasury: You have already voted");

        if(confirm) {
            _addConfirmation(trxId);
        } else {
            _rejectTrx(trxId);
        }

        if(trxInfo.confirmations == quorum) {
            trxInfo.status = TrxStatus.Confirmed;
            _swapTokens(
                trxId,
                trxInfo.swapTokensArgs.inputToken, 
                trxInfo.swapTokensArgs.outputToken, 
                trxInfo.swapTokensArgs.amount, 
                trxInfo.swapTokensArgs.user
                );
        }

        if((admins.length - trxInfo.rejects < quorum)) {
            trxInfo.status = TrxStatus.Rejected;
        }
        
    }

    /**
    @dev The function updates the majority of votes needed to make a decision
    Only owner can call.
    @param newQuorum new quorum.
    */
    function updateQuorum (uint256 newQuorum) external onlyOwner {
        require(newQuorum > 0, "MultiSigTreasury: Quorum should be don`t equal zero");
        quorum = newQuorum;
        emit UpdateQuorum(newQuorum);
    }

    /**
    @dev the function adds a new admin who can participate in voting 
    and increases the quorum by 1
    Only owner can call.
    @param verifiyer new verifiyer.
    */
    function addVerifiyer (address verifiyer) external onlyOwner {
        require(verifiyer != address(0), "MultiSigTreasury: Zero address");
        admins.push(verifiyer);
        _setupRole(VERIFIYER_ROLE, verifiyer);
        quorum += 1;
        emit AddVerifiyer(verifiyer);
    }

    /**
    @dev the function remove admin who can participate in voting 
    and decreases the quorum by 1
    Only owner can call.
    @param verifiyer removed verifiyer.
    */
    function removeVerifiyer(address verifiyer) external onlyOwner {
        require(hasRole(VERIFIYER_ROLE, verifiyer), "MultiSigTreasury: Not a verifyer");
        uint length = admins.length;
        uint i=0;

        while(admins[i] != verifiyer) {
            if(i == length) {
                revert();
            }
            i++;
        }

        admins[i] = admins[length-1];
        admins.pop();

        if(quorum > 0) {
            quorum -= 1;
        }
        revokeRole(VERIFIYER_ROLE, verifiyer);
        emit RemoveVerifiyer(verifiyer);
    }



//==================================== MultiSigTreasury view functions ==============================================================================
    
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

    /**
    @dev Public view function returns bool true if the user voted, false if not.
    @param trxId transaction id
    */
    function isVoted (uint256 trxId) public view returns (bool) {
        bool voted = false;
        if(votes[trxId][msg.sender] == 1 || votes[trxId][msg.sender] == 2) {
          voted = true;
        }
        
        return voted;
    }

    /**
    @dev Public view function admins array.
    */
    function getAdmins() public view returns(address[] memory) {
        return admins;
    }

//==================================== MultiSigTreasury internal functions ============================================================================
    
    /**
    @dev The function performs the purchase or sell tokens by exchanging tokens 
    on SpookySwapRouter.
    @param trxId transaction id
    @param inputToken Sell token
    @param outputToken Purchase token
    @param amount USDT token amount.
    @param user recipient wallet address
    */
    function _swapTokens(uint256 trxId, address inputToken, address outputToken, uint256 amount, address user) internal {
        require(IERC20(inputToken).balanceOf(address(this)) >= amount, "MultiSigTreasury: Not enough token balance");
        
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
        emit SwapTokens(trxId, inputToken, outputToken, amount, swapAmounts[1], user);
    }
    
    /**
    @dev Helper internal function for withdrawing erc20 tokens from Treasury contract.
    @param trxId transaction id
    @param token withdraw token address
    @param amount withdraw token amount.
    @param recipient recipient wallet address.
    */
    function _withdraw(uint256 trxId, address token, uint256 amount, address recipient) internal {
        require(IERC20(token).balanceOf(address(this)) >= amount, "MultiSigTreasury: Not enough token balance");

        IERC20(token).safeTransfer(recipient, amount);
        emit Withdraw(trxId, token, amount, recipient);
    }

    /**
    @dev Helper internal function for withdrawing FTM from Treasury contract.
    @param amount withdraw FTM amount.
    @param to recipient wallet address.
    */
    function _withdrawFTM(uint256 trxId, address payable to, uint256 amount) internal {
        to.transfer(amount);
        emit WithdrawFTM(trxId, to, amount);
    }

    /**
    @dev Helper internal function.Votes in favor of a particular transaction.
    @param trxId transaction id.
    */
    function _addConfirmation(uint256 trxId) internal {
        TrxData storage trxInfo = trxData[trxId];
        trxInfo.confirmations += 1;
        votes[trxId][msg.sender] = 1;
        emit AddConfirmation(trxId);
    }

    /**
    @dev Helper internal function.Casts a vote against certain transaction.
    @param trxId transaction id.
    */
    function _rejectTrx(uint256 trxId) internal {
        TrxData storage trxInfo = trxData[trxId];
        trxInfo.rejects += 1;
        votes[trxId][msg.sender] = 2;
        emit AddRejection(trxId);
    }
}
