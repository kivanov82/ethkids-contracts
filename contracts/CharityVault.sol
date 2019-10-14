pragma solidity ^0.5.2;

import "openzeppelin-solidity/contracts/ownership/Secondary.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title CharityVault
 * @dev Vault which holds the assets until the community leader(s) decide to transfer
 * them to the actual charity destination.
 * Deposit and withdrawal calls come only from the actual community contract
 */
contract CharityVault is Secondary {
    using SafeMath for uint256;

    mapping(address => uint256) private deposits;
    uint256 public sumStats;

    event LogEthReceived(
        uint256 amount,
        address indexed account
    );
    event LogEthSent(
        uint256 amount,
        address indexed account
    );

    /**
    * @dev fallback, 'anonymous' donation
    **/
    function() external payable {
        sumStats.add(msg.value);
        emit LogEthReceived(msg.value, msg.sender);
    }

    /**
     * @dev Stores the sent amount as credit to be withdrawn.
     * @param _payee The destination address of the funds.
     */
    function deposit(address _payee) public onlyPrimary payable {
        uint256 _amount = msg.value;
        deposits[_payee] = deposits[_payee].add(_amount);
        sumStats = sumStats.add(_amount);
        emit LogEthReceived(_amount, _payee);
    }

    /**
     * @dev Withdraw some of accumulated balance for a _payee.
     */
    function withdraw(address payable _payee, uint256 _payment) public onlyPrimary {
        require(_payment > 0 && address(this).balance >= _payment, "Insufficient funds in the charity fund");
        _payee.transfer(_payment);
        emit LogEthSent(_payment, _payee);
    }

    function depositsOf(address payee) public view returns (uint256) {
        return deposits[payee];
    }
}
