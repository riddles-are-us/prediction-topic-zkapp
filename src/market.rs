use serde::Serialize;
use zkwasm_rest_abi::StorageData;
use crate::config::{INITIAL_LIQUIDITY, PLATFORM_FEE_RATE};
use crate::error::*;

#[derive(Serialize, Clone, Debug)]
pub struct MarketData {
    pub title: String,
    pub description: String,
    pub start_time: u64,
    pub end_time: u64,
    pub resolution_time: u64,
    pub yes_liquidity: u64,
    pub no_liquidity: u64,
    pub total_volume: u64,
    pub resolved: bool,
    pub outcome: Option<bool>, // None = unresolved, Some(true) = Yes wins, Some(false) = No wins
    pub total_fees_collected: u64,
}

impl MarketData {
    pub fn new(title: String, description: String, start_time: u64, end_time: u64, resolution_time: u64) -> Self {
        MarketData {
            title,
            description,
            start_time,
            end_time,
            resolution_time,
            yes_liquidity: INITIAL_LIQUIDITY,
            no_liquidity: INITIAL_LIQUIDITY,
            total_volume: 0,
            resolved: false,
            outcome: None,
            total_fees_collected: 0,
        }
    }

    pub fn is_active(&self, current_time: u64) -> bool {
        current_time >= self.start_time && current_time < self.end_time && !self.resolved
    }

    pub fn can_resolve(&self, current_time: u64) -> bool {
        current_time >= self.resolution_time && !self.resolved
    }

    // AMM pricing function: constant product formula
    // Price of YES = no_liquidity / (yes_liquidity + no_liquidity)
    pub fn get_yes_price(&self) -> u64 {
        let total_liquidity = self.yes_liquidity + self.no_liquidity;
        if total_liquidity == 0 {
            return 500000; // 50% if no liquidity
        }
        // Return price in basis points (1000000 = 100%)
        (self.no_liquidity * 1000000) / total_liquidity
    }

    pub fn get_no_price(&self) -> u64 {
        let total_liquidity = self.yes_liquidity + self.no_liquidity;
        if total_liquidity == 0 {
            return 500000; // 50% if no liquidity
        }
        // Return price in basis points (1000000 = 100%)
        (self.yes_liquidity * 1000000) / total_liquidity
    }

    // Calculate shares received for a given bet amount using AMM
    pub fn calculate_yes_shares(&self, bet_amount: u64) -> u64 {
        if bet_amount == 0 {
            return 0;
        }
        
        // Apply platform fee
        let fee = (bet_amount * PLATFORM_FEE_RATE) / 10000;
        let net_amount = bet_amount - fee;
        
        // AMM formula: shares = liquidity_out - (k / (liquidity_in + net_amount))
        // where k = yes_liquidity * no_liquidity (constant product)
        let k = self.yes_liquidity * self.no_liquidity;
        let new_no_liquidity = self.no_liquidity + net_amount;
        let new_yes_liquidity = k / new_no_liquidity;
        
        if self.yes_liquidity > new_yes_liquidity {
            self.yes_liquidity - new_yes_liquidity
        } else {
            0
        }
    }

    pub fn calculate_no_shares(&self, bet_amount: u64) -> u64 {
        if bet_amount == 0 {
            return 0;
        }
        
        // Apply platform fee
        let fee = (bet_amount * PLATFORM_FEE_RATE) / 10000;
        let net_amount = bet_amount - fee;
        
        // AMM formula for NO shares
        let k = self.yes_liquidity * self.no_liquidity;
        let new_yes_liquidity = self.yes_liquidity + net_amount;
        let new_no_liquidity = k / new_yes_liquidity;
        
        if self.no_liquidity > new_no_liquidity {
            self.no_liquidity - new_no_liquidity
        } else {
            0
        }
    }

    // Execute a YES bet
    pub fn bet_yes(&mut self, bet_amount: u64) -> Result<u64, u32> {
        if bet_amount == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        let shares = self.calculate_yes_shares(bet_amount);
        if shares == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        // Apply platform fee
        let fee = (bet_amount * PLATFORM_FEE_RATE) / 10000;
        let net_amount = bet_amount - fee;
        
        // Update liquidity using AMM
        let k = self.yes_liquidity * self.no_liquidity;
        self.no_liquidity += net_amount;
        self.yes_liquidity = k / self.no_liquidity;
        
        self.total_volume += bet_amount;
        self.total_fees_collected += fee;
        
        Ok(shares)
    }

    // Execute a NO bet
    pub fn bet_no(&mut self, bet_amount: u64) -> Result<u64, u32> {
        if bet_amount == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        let shares = self.calculate_no_shares(bet_amount);
        if shares == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        // Apply platform fee
        let fee = (bet_amount * PLATFORM_FEE_RATE) / 10000;
        let net_amount = bet_amount - fee;
        
        // Update liquidity using AMM
        let k = self.yes_liquidity * self.no_liquidity;
        self.yes_liquidity += net_amount;
        self.no_liquidity = k / self.yes_liquidity;
        
        self.total_volume += bet_amount;
        self.total_fees_collected += fee;
        
        Ok(shares)
    }

    // Resolve the market
    pub fn resolve(&mut self, outcome: bool) -> Result<(), u32> {
        if self.resolved {
            return Err(ERROR_MARKET_ALREADY_RESOLVED);
        }
        
        self.resolved = true;
        self.outcome = Some(outcome);
        Ok(())
    }

    // Calculate payout for winning shares
    pub fn calculate_payout(&self, yes_shares: u64, no_shares: u64) -> u64 {
        if !self.resolved {
            return 0;
        }

        match self.outcome {
            Some(true) => yes_shares, // YES won, each YES share is worth 1 unit
            Some(false) => no_shares, // NO won, each NO share is worth 1 unit
            None => 0, // Should not happen if resolved is true
        }
    }
}

impl StorageData for MarketData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        // For simplicity, we'll store basic numeric data
        // In a real implementation, you'd want to handle strings properly
        MarketData {
            title: "Prediction Market".to_string(),
            description: "Will the event happen?".to_string(),
            start_time: *u64data.next().unwrap(),
            end_time: *u64data.next().unwrap(),
            resolution_time: *u64data.next().unwrap(),
            yes_liquidity: *u64data.next().unwrap(),
            no_liquidity: *u64data.next().unwrap(),
            total_volume: *u64data.next().unwrap(),
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
        data.push(self.total_volume);
        data.push(if self.resolved { 1 } else { 0 });
        data.push(match self.outcome {
            None => 0,
            Some(false) => 1,
            Some(true) => 2,
        });
        data.push(self.total_fees_collected);
    }
} 