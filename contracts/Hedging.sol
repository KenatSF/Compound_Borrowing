//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { CErc20, Comptroller, PriceFeed } from "./compound.sol";


contract Hedging {
  IERC20 public token;
  CErc20 public cToken;
  Comptroller public comptroller;
  PriceFeed public priceFeed;

  event Log(string message, uint val);
  event HedgingBorrowing(uint liquidez, uint precio, uint maxPrestamo);

  constructor(address _token, address _cToken, address _unitroller, address _pricefeed)  {
      token = IERC20(_token);
      cToken = CErc20(_cToken);
      comptroller = Comptroller(_unitroller);
      priceFeed = PriceFeed(_pricefeed);
  }

  function supply(uint _amount) external {
    token.transferFrom(msg.sender, address(this), _amount);
    token.approve(address(cToken), _amount);
    require(cToken.mint(_amount) == 0, "mint failed");
  }

  function getCTokenBalance() external view returns (uint) {
    return cToken.balanceOf(address(this));
  }

  //## not view function
  function getInfo() external returns (uint exchangeRate, uint supplyRate) {
    // Amount of current exchange rate from cToken to underlying
    exchangeRate = cToken.exchangeRateCurrent();                            // NOT view function
    // Amount added to you supply balance this block
    supplyRate = cToken.supplyRatePerBlock();
              
  }

    //## not view function
    // function estimateBalanceOfUnderlying() external returns (uint) {
    //   uint cTokenBal = cToken.balanceOf(address(this));
    //   uint exchangeRate = cToken.exchangeRateCurrent();
    //   uint decimals = 8; // WBTC = 8 decimals
    //   uint cTokenDecimals = 8;

    //   return (cTokenBal * exchangeRate) / 10**(18 + decimals - cTokenDecimals);
    // }

  //## not view function
  function balanceOfUnderlying() external returns (uint) {
    return cToken.balanceOfUnderlying(address(this));                         // not view function
  }

  function redeem(uint _cTokenAmount) external {
    require(cToken.redeem(_cTokenAmount) == 0, "redeem failed");
    // cToken.redeemUnderlying(underlying amount);
  }

  // borrow and repay //
  function getCollateralFactor() external view returns (uint) {
    (bool isListed, uint colFactor, bool isComped) = comptroller.markets(
      address(cToken)
    );
    return colFactor; // divide by 1e18 to get in %, check constant's Comptroller contract
  }

    // account liquidity - calculate how much can I borrow?
    // sum of (supplied balance of market entered * col factor) - borrowed
  function getAccountLiquidity()
    external
    view
    returns (uint liquidity, uint shortfall)
  {
    // liquidity and shortfall in USD scaled up by 1e18
    (uint error, uint _liquidity, uint _shortfall) = comptroller.getAccountLiquidity(
      address(this)
    );
    require(error == 0, "error");
    // Expected behaviour -> liquidity > 0 and shortfall == 0
    // liquidity > 0 means account can borrow up to `liquidity`
    // shortfall > 0 is subject to liquidation, you borrowed over limit
    return (_liquidity, _shortfall);
  }

  // open price feed - USD price of token to borrow
  function getPriceFeed(address _cToken) external view returns (uint) {
    // scaled up by 1e18
    // Note: Inside getUnderlyingPrice function numbers have 1e36 units, the returns of this functios has: 1e36 - 1e(token decimals) (including amount decimals)
    //  1000285000000000000 dai ->18
    //  1000000000000000000000000000000 usdc -> 6
    //  300334543490000000000000000000000   wbtc -> 8
    return priceFeed.getUnderlyingPrice(_cToken);
  }

  // enter market and borrow
  function borrow(address _cTokenToBorrow, uint _decimals) external {
    // enter market
    // enter the supply market so you can borrow another type of asset
    address[] memory cTokens = new address[](1);
    cTokens[0] = address(cToken);
    uint[] memory errors = comptroller.enterMarkets(cTokens);
    require(errors[0] == 0, "Comptroller.enterMarkets failed.");

    // check liquidity
    (uint error, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(
      address(this)
    );
                            // Note: liquidity has 18 decimals

    require(error == 0, "error");
    require(shortfall == 0, "shortfall > 0");
    require(liquidity > 0, "liquidity = 0"); // Note: Returns your maxAmount to borrow in function of your assets, in this case just 1 WBTC price $30,000 ie 21,190 its 70%

    // calculate max borrow
    uint price = priceFeed.getUnderlyingPrice(_cTokenToBorrow);

    // liquidity - USD scaled up by 1e18
    // price - USD scaled up by 1e18
    // decimals - decimals of token to borrow
    uint maxBorrow = (liquidity * (10**_decimals)) / price;     // Note:  Asi como esta escrita esta linea: liquidity == maxBorrow == $21,256
    require(maxBorrow > 0, "max borrow = 0");

    // borrow 50% of max borrow
    uint amount = (maxBorrow * 50) / 100;
    require(CErc20(_cTokenToBorrow).borrow(amount) == 0, "borrow failed");

    emit HedgingBorrowing(liquidity, price, maxBorrow);
  }

  // borrowed balance (includes interest)
  // not view function
  function getBorrowedBalance(address _cTokenBorrowed) public returns (uint) {
    return CErc20(_cTokenBorrowed).borrowBalanceCurrent(address(this));
  }


  // repay borrow
  function repay(
    address _tokenBorrowed,
    address _cTokenBorrowed,
    uint _amount
  ) external {
    IERC20(_tokenBorrowed).approve(_cTokenBorrowed, _amount);
    require(CErc20(_cTokenBorrowed).repayBorrow(_amount) == 0, "repay failed");
  }

  function fullRepay(
    address _tokenBorrowed,
    address _cTokenBorrowed
  ) external {
    IERC20(_tokenBorrowed).approve(_cTokenBorrowed, ~uint256(0));
    // _amount = 2 ** 256 - 1 means repay all
    require(CErc20(_cTokenBorrowed).repayBorrow(~uint256(0)) == 0, "repay failed");
  }
 
}
