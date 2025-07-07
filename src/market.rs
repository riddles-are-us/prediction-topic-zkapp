use serde::Serialize;
use zkwasm_rest_abi::StorageData;
use zkwasm_rest_convention::IndexedObject;
use crate::config::PRICE_PRECISION;
use crate::error::*;
use crate::math_safe::*;


#[derive(Serialize, Clone, Debug)]
pub struct MarketData {
    pub title: Vec<u64>,  // Title encoded as Vec<u64> (8 bytes per u64)
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
    pub fn new_with_title_u64_and_liquidity(
        title: Vec<u64>, 
        start_time: u64, 
        end_time: u64, 
        resolution_time: u64,
        initial_yes_liquidity: u64,
        initial_no_liquidity: u64
    ) -> Result<Self, u32> {
        // 验证标题长度（命令长度限制）
        // CreateMarket命令格式：[cmd_type, title_data..., start, end, resolution, yes_liq, no_liq]
        // 总长度必须 < 16，所以 title_len < 10，最大值为9 (16 - 1 - 5 = 10)
        if title.len() > 9 {
            return Err(crate::error::ERROR_INVALID_MARKET_TITLE);
        }
        
        // 验证时间参数
        if start_time >= end_time {
            return Err(crate::error::ERROR_INVALID_MARKET_TIME);
        }
        if end_time > resolution_time {
            return Err(crate::error::ERROR_INVALID_MARKET_TIME);
        }
        
        // 验证初始流动性
        validate_liquidity(initial_yes_liquidity)?;
        validate_liquidity(initial_no_liquidity)?;
        
        Ok(MarketData {
            title,
            start_time,
            end_time,
            resolution_time,
            // Virtual liquidity for AMM pricing
            yes_liquidity: initial_yes_liquidity,
            no_liquidity: initial_no_liquidity,
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



    // Helper function to convert string to Vec<u64>
    pub fn string_to_u64_vec(s: &str) -> Vec<u64> {
        let bytes = s.as_bytes();
        let mut result = Vec::new();
        
        for chunk in bytes.chunks(8) {
            let mut value = 0u64;
            for (i, &byte) in chunk.iter().enumerate() {
                value |= (byte as u64) << (i * 8);
            }
            result.push(value);
        }
        
        result
    }

    // Helper function to convert Vec<u64> back to string
    pub fn u64_vec_to_string(title: &[u64]) -> String {
        let mut bytes = Vec::new();
        
        for &value in title {
            for i in 0..8 {
                let byte = ((value >> (i * 8)) & 0xFF) as u8;
                if byte != 0 {  // Stop at null terminator
                    bytes.push(byte);
                } else {
                    break;
                }
            }
        }
        
        String::from_utf8_lossy(&bytes).to_string()
    }

    pub fn get_title_string(&self) -> String {
        Self::u64_vec_to_string(&self.title)
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

    // 验证投注类型的辅助函数
    fn validate_bet_type(bet_type: u64) -> Result<bool, u32> {
        match bet_type {
            0 => Ok(false), // NO bet
            1 => Ok(true),  // YES bet  
            _ => Err(crate::error::ERROR_INVALID_BET_TYPE),
        }
    }

    // 统一的份额计算函数（bet_type: 1=YES, 0=NO）
    pub fn calculate_shares(&self, bet_type: u64, bet_amount: u64) -> Result<u64, u32> {
        validate_bet_amount(bet_amount)?;
        let is_yes_bet = Self::validate_bet_type(bet_type)?;
        
        let net_amount = calculate_net_amount_safe(bet_amount)?;
        
        // 安全的 AMM 计算
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        
        let (new_yes_liquidity, new_no_liquidity, original_liquidity) = if is_yes_bet {
            let new_no = safe_add(self.no_liquidity, net_amount)?;
            let new_yes = calculate_new_liquidity_safe(k, new_no)?;
            (new_yes, new_no, self.yes_liquidity)
        } else {
            let new_yes = safe_add(self.yes_liquidity, net_amount)?;
            let new_no = calculate_new_liquidity_safe(k, new_yes)?;
            (new_yes, new_no, self.no_liquidity)
        };
        
        if original_liquidity >= if is_yes_bet { new_yes_liquidity } else { new_no_liquidity } {
            let shares = safe_sub(original_liquidity, if is_yes_bet { new_yes_liquidity } else { new_no_liquidity })?;
            validate_shares(shares)?;
            Ok(shares)
        } else {
            Ok(0)
        }
    }



    // 统一的卖出份额计算（返回净收益和费用）
    pub fn calculate_sell_details(&self, sell_type: u64, shares_to_sell: u64) -> Result<(u64, u64), u32> {
        validate_shares(shares_to_sell)?;
        let is_yes_sell = Self::validate_bet_type(sell_type)?;
        
        let total_shares = if is_yes_sell {
            self.total_yes_shares
        } else {
            self.total_no_shares
        };
        
        if total_shares == 0 {
            return Ok((0, 0));
        }
        
        // 安全的 AMM 计算
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        let (new_yes_liquidity, new_no_liquidity) = if is_yes_sell {
            let new_yes = safe_add(self.yes_liquidity, shares_to_sell)?;
            let new_no = calculate_new_liquidity_safe(k, new_yes)?;
            (new_yes, new_no)
        } else {
            let new_no = safe_add(self.no_liquidity, shares_to_sell)?;
            let new_yes = calculate_new_liquidity_safe(k, new_no)?;
            (new_yes, new_no)
        };
        
        let gross_amount = if is_yes_sell {
            if self.no_liquidity >= new_no_liquidity {
                safe_sub(self.no_liquidity, new_no_liquidity)?
            } else {
                return Ok((0, 0));
            }
        } else {
            if self.yes_liquidity >= new_yes_liquidity {
                safe_sub(self.yes_liquidity, new_yes_liquidity)?
            } else {
                return Ok((0, 0));
            }
        };
        
        let fee = calculate_fee_safe(gross_amount)?;
        let net_payout = safe_sub(gross_amount, fee)?;
        
        Ok((net_payout, fee))
    }



    // // 统一的买入价格计算（bet_type: 1=YES, 0=NO）- 前端分析用，后端不使用
    // pub fn get_buy_price(&self, bet_type: u64, bet_amount: u64) -> Result<u64, u32> {
    //     let shares = self.calculate_shares(bet_type, bet_amount)?;
    //     calculate_effective_price_safe(bet_amount, shares)
    // }

    // // 统一的卖出价格计算（sell_type: 1=YES, 0=NO）- 前端分析用，后端不使用
    // pub fn get_sell_price(&self, sell_type: u64, shares_to_sell: u64) -> Result<u64, u32> {
    //     let (payout, _) = self.calculate_sell_details(sell_type, shares_to_sell)?;
    //     calculate_effective_price_safe(payout, shares_to_sell)
    // }



    // // 市场影响分析（安全版本）- 前端分析用，后端不使用
    // pub fn get_buy_market_impact(&self, bet_type: u64, bet_amount: u64) -> Result<(u64, u64), u32> {
    //     let current_yes_price = self.get_yes_price()?;
    //     let current_no_price = self.get_no_price()?;
    //     
    //     if bet_amount == 0 {
    //         return Ok((current_yes_price, current_no_price));
    //     }
    //     
    //     // 模拟交易
    //     let mut temp_market = self.clone();
    //     let _ = temp_market.place_bet(bet_type, bet_amount)?;
    //     
    //     let new_yes_price = temp_market.get_yes_price()?;
    //     let new_no_price = temp_market.get_no_price()?;
    //     
    //     Ok((new_yes_price, new_no_price))
    // }

    // // 滑点计算（安全版本）- 前端分析用，后端不使用
    // pub fn get_slippage(&self, bet_type: u64, bet_amount: u64) -> Result<u64, u32> {
    //     if bet_amount == 0 {
    //         return Ok(0);
    //     }
    //     
    //     let current_price = if bet_type == 1 {
    //         self.get_yes_price()?
    //     } else {
    //         self.get_no_price()?
    //     };
    //     
    //     let effective_price = self.get_buy_price(bet_type, bet_amount)?;
    //     
    //     if effective_price > current_price {
    //         safe_sub(effective_price, current_price)
    //     } else {
    //         Ok(0)
    //     }
    // }

    // 统一的投注函数（bet_type: 1=YES, 0=NO）
    pub fn place_bet(&mut self, bet_type: u64, bet_amount: u64) -> Result<u64, u32> {
        validate_bet_amount(bet_amount)?;

        let shares = self.calculate_shares(bet_type, bet_amount)?;
        if shares == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        let fee = calculate_fee_safe(bet_amount)?;
        let net_amount = safe_sub(bet_amount, fee)?;
        let is_yes_bet = bet_type == 1;
        
        // 安全更新 AMM 流动性
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        if is_yes_bet {
            self.no_liquidity = safe_add(self.no_liquidity, net_amount)?;
            self.yes_liquidity = calculate_new_liquidity_safe(k, self.no_liquidity)?;
            self.total_yes_shares = safe_add(self.total_yes_shares, shares)?;
        } else {
            self.yes_liquidity = safe_add(self.yes_liquidity, net_amount)?;
            self.no_liquidity = calculate_new_liquidity_safe(k, self.yes_liquidity)?;
            self.total_no_shares = safe_add(self.total_no_shares, shares)?;
        }
        
        // 安全更新状态
        self.prize_pool = safe_add(self.prize_pool, net_amount)?;
        self.total_volume = safe_add(self.total_volume, bet_amount)?;
        self.total_fees_collected = safe_add(self.total_fees_collected, fee)?;
        
        Ok(shares)
    }



    // 统一的卖出函数（sell_type: 1=YES, 0=NO）
    pub fn sell_shares(&mut self, sell_type: u64, shares_to_sell: u64) -> Result<u64, u32> {
        validate_shares(shares_to_sell)?;

        let (total_shares, is_yes_sell) = if sell_type == 1 {
            (self.total_yes_shares, true)
        } else {
            (self.total_no_shares, false)
        };

        if shares_to_sell > total_shares {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }

        // 使用优化的计算函数，一次性计算净收益和费用
        let (payout, fee) = self.calculate_sell_details(sell_type, shares_to_sell)?;
        if payout == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        if payout > self.prize_pool {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }

        // 安全更新 AMM 流动性
        let k = calculate_k_safe(self.yes_liquidity, self.no_liquidity)?;
        if is_yes_sell {
            self.yes_liquidity = safe_add(self.yes_liquidity, shares_to_sell)?;
            self.no_liquidity = calculate_new_liquidity_safe(k, self.yes_liquidity)?;
            self.total_yes_shares = safe_sub(self.total_yes_shares, shares_to_sell)?;
        } else {
            self.no_liquidity = safe_add(self.no_liquidity, shares_to_sell)?;
            self.yes_liquidity = calculate_new_liquidity_safe(k, self.no_liquidity)?;
            self.total_no_shares = safe_sub(self.total_no_shares, shares_to_sell)?;
        }

        // 安全更新状态
        self.prize_pool = safe_sub(self.prize_pool, payout)?;
        self.total_fees_collected = safe_add(self.total_fees_collected, fee)?;
        // 将卖出金额（payout + fee）计入总交易量
        let total_transaction_value = safe_add(payout, fee)?;
        self.total_volume = safe_add(self.total_volume, total_transaction_value)?;

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

    // // 获取份额价值（解决前估算）- 前端分析用，后端不使用
    // pub fn get_share_value(&self, is_yes_share: bool) -> Result<u64, u32> {
    //     if self.prize_pool == 0 {
    //         return Ok(0);
    //     }
    //     
    //     if is_yes_share {
    //         if self.total_yes_shares == 0 { return Ok(0); }
    //         let total_shares = safe_add(self.total_yes_shares, self.total_no_shares)?;
    //         safe_div(self.prize_pool, total_shares)
    //     } else {
    //         if self.total_no_shares == 0 { return Ok(0); }
    //         let total_shares = safe_add(self.total_yes_shares, self.total_no_shares)?;
    //         safe_div(self.prize_pool, total_shares)
    //     }
    // }
}

impl StorageData for MarketData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        let title_len = *u64data.next().unwrap() as usize;
        let mut title = Vec::new();
        for _ in 0..title_len {
            title.push(*u64data.next().unwrap());
        }
        
        MarketData {
            title,
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
        data.push(self.title.len() as u64);
        data.extend_from_slice(&self.title);
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

impl IndexedObject<MarketData> for MarketData {
    const PREFIX: u64 = 0x1ee3;
    const POSTFIX: u64 = 0xfee3;
    const EVENT_NAME: u64 = 0x02;
} 