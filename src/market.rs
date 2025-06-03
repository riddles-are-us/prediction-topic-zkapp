use serde::Serialize;
use zkwasm_rest_abi::StorageData;
use crate::config::{DEFAULT_MARKET, PRICE_PRECISION};
use crate::error::*;
use crate::math_safe::*;

#[derive(Serialize, Clone, Debug)]
pub struct MarketData {
    pub title: String,
    pub description: String,
    pub start_time: u64,
    pub end_time: u64,
    pub resolution_time: u64,
    // AMM virtual liquidity (for pricing only)
    pub yes_liquidity: u64,
    pub no_liquidity: u64,
    // Actual prize pool from user bets
    pub prize_pool: u64,
    pub total_volume: u64,
    pub total_yes_shares: u64,  // Total YES shares issued
    pub total_no_shares: u64,   // Total NO shares issued
    pub resolved: bool,
    pub outcome: Option<bool>, // None = unresolved, Some(true) = Yes wins, Some(false) = No wins
    pub total_fees_collected: u64,
}

impl MarketData {
    pub fn new(title: String, description: String, start_time: u64, end_time: u64, resolution_time: u64) -> Result<Self, u32> {
        // 验证初始流动性
        validate_liquidity(DEFAULT_MARKET.initial_yes_liquidity)?;
        validate_liquidity(DEFAULT_MARKET.initial_no_liquidity)?;
        
        Ok(MarketData {
            title,
            description,
            start_time,
            end_time,
            resolution_time,
            // Virtual liquidity for AMM pricing
            yes_liquidity: DEFAULT_MARKET.initial_yes_liquidity,
            no_liquidity: DEFAULT_MARKET.initial_no_liquidity,
            // Real money tracking
            prize_pool: 0,
            total_volume: 0,
            total_yes_shares: 0,
            total_no_shares: 0,
            resolved: false,
            outcome: None,
            total_fees_collected: 0,
        })
    }

    pub fn is_active(&self, current_time: u64) -> bool {
        current_time >= self.start_time && current_time < self.end_time && !self.resolved
    }

    pub fn can_resolve(&self, current_time: u64) -> bool {
        current_time >= self.resolution_time && !self.resolved
    }

    // 安全的 YES 价格计算
    pub fn get_yes_price(&self) -> Result<u64, u32> {
        let total_liquidity = safe_add(self.yes_liquidity, self.no_liquidity)?;
        if total_liquidity == 0 {
            return Ok(PRICE_PRECISION / 2); // 50% if no liquidity
        }
        calculate_price_safe(self.no_liquidity, total_liquidity)
    }

    // 安全的 NO 价格计算
    pub fn get_no_price(&self) -> Result<u64, u32> {
        let total_liquidity = safe_add(self.yes_liquidity, self.no_liquidity)?;
        if total_liquidity == 0 {
            return Ok(PRICE_PRECISION / 2); // 50% if no liquidity
        }
        calculate_price_safe(self.yes_liquidity, total_liquidity)
    }

    // 安全计算 YES 份额
    pub fn calculate_yes_shares(&self, bet_amount: u64) -> Result<u64, u32> {
        validate_bet_amount(bet_amount)?;
        
        let net_amount = calculate_net_amount_safe(bet_amount)?;
        
        // 安全的 AMM 计算
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        let new_no_liquidity = safe_add(self.no_liquidity, net_amount)?;
        let new_yes_liquidity = calculate_new_liquidity_safe(k, new_no_liquidity)?;
        
        if self.yes_liquidity >= new_yes_liquidity {
            let shares = safe_sub(self.yes_liquidity, new_yes_liquidity)?;
            validate_shares(shares)?;
            Ok(shares)
        } else {
            Ok(0)
        }
    }

    // 安全计算 NO 份额
    pub fn calculate_no_shares(&self, bet_amount: u64) -> Result<u64, u32> {
        validate_bet_amount(bet_amount)?;
        
        let net_amount = calculate_net_amount_safe(bet_amount)?;
        
        // 安全的 AMM 计算
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        let new_yes_liquidity = safe_add(self.yes_liquidity, net_amount)?;
        let new_no_liquidity = calculate_new_liquidity_safe(k, new_yes_liquidity)?;
        
        if self.no_liquidity >= new_no_liquidity {
            let shares = safe_sub(self.no_liquidity, new_no_liquidity)?;
            validate_shares(shares)?;
            Ok(shares)
        } else {
            Ok(0)
        }
    }

    // 安全计算 YES 卖出价值
    pub fn calculate_yes_sell_value(&self, shares_to_sell: u64) -> Result<u64, u32> {
        validate_shares(shares_to_sell)?;
        
        if self.total_yes_shares == 0 {
            return Ok(0);
        }
        
        // 安全的 AMM 计算
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        let new_yes_liquidity = safe_add(self.yes_liquidity, shares_to_sell)?;
        let new_no_liquidity = calculate_new_liquidity_safe(k, new_yes_liquidity)?;
        
        if self.no_liquidity >= new_no_liquidity {
            let gross_amount = safe_sub(self.no_liquidity, new_no_liquidity)?;
            let fee = calculate_fee_safe(gross_amount)?;
            safe_sub(gross_amount, fee)
        } else {
            Ok(0)
        }
    }

    // 安全计算 NO 卖出价值
    pub fn calculate_no_sell_value(&self, shares_to_sell: u64) -> Result<u64, u32> {
        validate_shares(shares_to_sell)?;
        
        if self.total_no_shares == 0 {
            return Ok(0);
        }
        
        // 安全的 AMM 计算
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        let new_no_liquidity = safe_add(self.no_liquidity, shares_to_sell)?;
        let new_yes_liquidity = calculate_new_liquidity_safe(k, new_no_liquidity)?;
        
        if self.yes_liquidity >= new_yes_liquidity {
            let gross_amount = safe_sub(self.yes_liquidity, new_yes_liquidity)?;
            let fee = calculate_fee_safe(gross_amount)?;
            safe_sub(gross_amount, fee)
        } else {
            Ok(0)
        }
    }

    // 安全的买入价格计算
    pub fn get_buy_yes_price(&self, bet_amount: u64) -> Result<u64, u32> {
        let shares = self.calculate_yes_shares(bet_amount)?;
        calculate_effective_price_safe(bet_amount, shares)
    }

    pub fn get_buy_no_price(&self, bet_amount: u64) -> Result<u64, u32> {
        let shares = self.calculate_no_shares(bet_amount)?;
        calculate_effective_price_safe(bet_amount, shares)
    }

    // 安全的卖出价格计算
    pub fn get_sell_yes_price(&self, shares_to_sell: u64) -> Result<u64, u32> {
        let payout = self.calculate_yes_sell_value(shares_to_sell)?;
        calculate_effective_price_safe(payout, shares_to_sell)
    }

    pub fn get_sell_no_price(&self, shares_to_sell: u64) -> Result<u64, u32> {
        let payout = self.calculate_no_sell_value(shares_to_sell)?;
        calculate_effective_price_safe(payout, shares_to_sell)
    }

    // 市场影响分析（安全版本）
    pub fn get_buy_market_impact(&self, bet_type: u64, bet_amount: u64) -> Result<(u64, u64), u32> {
        let current_yes_price = self.get_yes_price()?;
        let current_no_price = self.get_no_price()?;
        
        if bet_amount == 0 {
            return Ok((current_yes_price, current_no_price));
        }
        
        // 模拟交易
        let mut temp_market = self.clone();
        if bet_type == 1 {
            let _ = temp_market.bet_yes(bet_amount)?;
        } else {
            let _ = temp_market.bet_no(bet_amount)?;
        }
        
        let new_yes_price = temp_market.get_yes_price()?;
        let new_no_price = temp_market.get_no_price()?;
        
        Ok((new_yes_price, new_no_price))
    }

    // 滑点计算（安全版本）
    pub fn get_slippage(&self, bet_type: u64, bet_amount: u64) -> Result<u64, u32> {
        if bet_amount == 0 {
            return Ok(0);
        }
        
        let current_price = if bet_type == 1 {
            self.get_yes_price()?
        } else {
            self.get_no_price()?
        };
        
        let effective_price = if bet_type == 1 {
            self.get_buy_yes_price(bet_amount)?
        } else {
            self.get_buy_no_price(bet_amount)?
        };
        
        if effective_price > current_price {
            safe_sub(effective_price, current_price)
        } else {
            Ok(0)
        }
    }

    // 安全执行 YES 投注
    pub fn bet_yes(&mut self, bet_amount: u64) -> Result<u64, u32> {
        validate_bet_amount(bet_amount)?;

        let shares = self.calculate_yes_shares(bet_amount)?;
        if shares == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        let fee = calculate_fee_safe(bet_amount)?;
        let net_amount = safe_sub(bet_amount, fee)?;
        
        // 安全更新 AMM 流动性
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        self.no_liquidity = safe_add(self.no_liquidity, net_amount)?;
        self.yes_liquidity = calculate_new_liquidity_safe(k, self.no_liquidity)?;
        
        // 安全更新状态
        self.prize_pool = safe_add(self.prize_pool, net_amount)?;
        self.total_volume = safe_add(self.total_volume, bet_amount)?;
        self.total_yes_shares = safe_add(self.total_yes_shares, shares)?;
        self.total_fees_collected = safe_add(self.total_fees_collected, fee)?;
        
        Ok(shares)
    }

    // 安全执行 NO 投注
    pub fn bet_no(&mut self, bet_amount: u64) -> Result<u64, u32> {
        validate_bet_amount(bet_amount)?;

        let shares = self.calculate_no_shares(bet_amount)?;
        if shares == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        let fee = calculate_fee_safe(bet_amount)?;
        let net_amount = safe_sub(bet_amount, fee)?;
        
        // 安全更新 AMM 流动性
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        self.yes_liquidity = safe_add(self.yes_liquidity, net_amount)?;
        self.no_liquidity = calculate_new_liquidity_safe(k, self.yes_liquidity)?;
        
        // 安全更新状态
        self.prize_pool = safe_add(self.prize_pool, net_amount)?;
        self.total_volume = safe_add(self.total_volume, bet_amount)?;
        self.total_no_shares = safe_add(self.total_no_shares, shares)?;
        self.total_fees_collected = safe_add(self.total_fees_collected, fee)?;
        
        Ok(shares)
    }

    // 安全执行 YES 卖出
    pub fn sell_yes(&mut self, shares_to_sell: u64) -> Result<u64, u32> {
        validate_shares(shares_to_sell)?;

        if shares_to_sell > self.total_yes_shares {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }

        let payout = self.calculate_yes_sell_value(shares_to_sell)?;
        if payout == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        if payout > self.prize_pool {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }

        // 安全更新 AMM 流动性
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        self.yes_liquidity = safe_add(self.yes_liquidity, shares_to_sell)?;
        self.no_liquidity = calculate_new_liquidity_safe(k, self.yes_liquidity)?;

        // 安全更新状态
        self.prize_pool = safe_sub(self.prize_pool, payout)?;
        self.total_yes_shares = safe_sub(self.total_yes_shares, shares_to_sell)?;
        
        // 计算并收取费用
        let gross_amount = safe_sub(self.no_liquidity, calculate_new_liquidity_safe(k, self.yes_liquidity)?)?;
        let fee = calculate_fee_safe(gross_amount)?;
        self.total_fees_collected = safe_add(self.total_fees_collected, fee)?;

        Ok(payout)
    }

    // 安全执行 NO 卖出
    pub fn sell_no(&mut self, shares_to_sell: u64) -> Result<u64, u32> {
        validate_shares(shares_to_sell)?;

        if shares_to_sell > self.total_no_shares {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }

        let payout = self.calculate_no_sell_value(shares_to_sell)?;
        if payout == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        if payout > self.prize_pool {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }

        // 安全更新 AMM 流动性
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        self.no_liquidity = safe_add(self.no_liquidity, shares_to_sell)?;
        self.yes_liquidity = calculate_new_liquidity_safe(k, self.no_liquidity)?;

        // 安全更新状态
        self.prize_pool = safe_sub(self.prize_pool, payout)?;
        self.total_no_shares = safe_sub(self.total_no_shares, shares_to_sell)?;
        
        // 计算并收取费用
        let gross_amount = safe_sub(self.yes_liquidity, calculate_new_liquidity_safe(k, self.no_liquidity)?)?;
        let fee = calculate_fee_safe(gross_amount)?;
        self.total_fees_collected = safe_add(self.total_fees_collected, fee)?;

        Ok(payout)
    }

    // 市场解决
    pub fn resolve(&mut self, outcome: bool) -> Result<(), u32> {
        if self.resolved {
            return Err(ERROR_MARKET_ALREADY_RESOLVED);
        }
        
        self.resolved = true;
        self.outcome = Some(outcome);
        Ok(())
    }

    // 安全计算奖金
    pub fn calculate_payout(&self, yes_shares: u64, no_shares: u64) -> Result<u64, u32> {
        if !self.resolved || self.prize_pool == 0 {
            return Ok(0);
        }

        match self.outcome {
            Some(true) => {
                // YES 获胜
                if self.total_yes_shares == 0 {
                    return Ok(0);
                }
                safe_div_high_precision(yes_shares, self.prize_pool, self.total_yes_shares)
            },
            Some(false) => {
                // NO 获胜
                if self.total_no_shares == 0 {
                    return Ok(0);
                }
                safe_div_high_precision(no_shares, self.prize_pool, self.total_no_shares)
            },
            None => Ok(0),
        }
    }

    // 获取份额价值（解决前估算）
    pub fn get_share_value(&self, is_yes_share: bool) -> Result<u64, u32> {
        if self.prize_pool == 0 {
            return Ok(0);
        }
        
        if is_yes_share {
            if self.total_yes_shares == 0 { return Ok(0); }
            let total_shares = safe_add(self.total_yes_shares, self.total_no_shares)?;
            safe_div(self.prize_pool, total_shares)
        } else {
            if self.total_no_shares == 0 { return Ok(0); }
            let total_shares = safe_add(self.total_yes_shares, self.total_no_shares)?;
            safe_div(self.prize_pool, total_shares)
        }
    }
}

impl StorageData for MarketData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        MarketData {
            title: "Prediction Market".to_string(),
            description: "Will the event happen?".to_string(),
            start_time: *u64data.next().unwrap(),
            end_time: *u64data.next().unwrap(),
            resolution_time: *u64data.next().unwrap(),
            yes_liquidity: *u64data.next().unwrap(),
            no_liquidity: *u64data.next().unwrap(),
            prize_pool: *u64data.next().unwrap(),
            total_volume: *u64data.next().unwrap(),
            total_yes_shares: *u64data.next().unwrap(),
            total_no_shares: *u64data.next().unwrap(),
            resolved: *u64data.next().unwrap() != 0,
            outcome: {
                let outcome_val = *u64data.next().unwrap();
                if outcome_val == 0 { None }
                else if outcome_val == 1 { Some(false) }
                else { Some(true) }
            },
            total_fees_collected: *u64data.next().unwrap(),
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.start_time);
        data.push(self.end_time);
        data.push(self.resolution_time);
        data.push(self.yes_liquidity);
        data.push(self.no_liquidity);
        data.push(self.prize_pool);
        data.push(self.total_volume);
        data.push(self.total_yes_shares);
        data.push(self.total_no_shares);
        data.push(if self.resolved { 1 } else { 0 });
        data.push(match self.outcome {
            None => 0,
            Some(false) => 1,
            Some(true) => 2,
        });
        data.push(self.total_fees_collected);
    }
} 