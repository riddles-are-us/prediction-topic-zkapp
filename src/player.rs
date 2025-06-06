use serde::Serialize;
use zkwasm_rest_abi::StorageData;
use crate::error::*;
use crate::state::GLOBAL_STATE;

#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerData {
    pub balance: u64,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub claimed: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct PredictionMarketPlayer {
    pub player_id: [u64; 2],
    pub nonce: u64,
    pub data: PlayerData,
}

impl PredictionMarketPlayer {
    pub fn get(pkey: &[u64; 4]) -> Option<Self> {
        let player_id = Player::pkey_to_pid(pkey);
        let player = Player::get_from_pid(&player_id);
        
        match player {
            Some(player) => Some(PredictionMarketPlayer {
                player_id,
                nonce: player.nonce,
                data: player.data,
            }),
            None => {
                // Return default player with global info
                Some(PredictionMarketPlayer {
                    player_id,
                    nonce: 0,
                    data: PlayerData::default(),
                })
            }
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