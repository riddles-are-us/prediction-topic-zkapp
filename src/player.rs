use serde::Serialize;
use zkwasm_rest_abi::StorageData;
use crate::error::*;

#[derive(Serialize, Clone, Debug)]
pub struct PlayerData {
    pub balance: u64,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub claimed: bool,
}

impl Default for PlayerData {
    fn default() -> Self {
        Self {
            balance: 0,
            yes_shares: 0,
            no_shares: 0,
            claimed: false,
        }
    }
}

impl PlayerData {
    pub fn add_balance(&mut self, amount: u64) {
        self.balance += amount;
    }

    pub fn spend_balance(&mut self, amount: u64) -> Result<(), u32> {
        if self.balance < amount {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }
        self.balance -= amount;
        Ok(())
    }

    pub fn add_yes_shares(&mut self, shares: u64) {
        self.yes_shares += shares;
    }

    pub fn add_no_shares(&mut self, shares: u64) {
        self.no_shares += shares;
    }

    pub fn claim_winnings(&mut self) -> Result<(), u32> {
        if self.claimed {
            return Err(ERROR_ALREADY_CLAIMED);
        }
        self.claimed = true;
        Ok(())
    }
}

impl StorageData for PlayerData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerData {
            balance: *u64data.next().unwrap(),
            yes_shares: *u64data.next().unwrap(),
            no_shares: *u64data.next().unwrap(),
            claimed: *u64data.next().unwrap() != 0,
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.balance);
        data.push(self.yes_shares);
        data.push(self.no_shares);
        data.push(if self.claimed { 1 } else { 0 });
    }
}

pub type Player = zkwasm_rest_abi::Player<PlayerData>; 