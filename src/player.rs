use serde::Serialize;
use zkwasm_rest_abi::{StorageData, MERKLE_MAP};
use crate::error::*;

#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerMarketPosition {
    pub yes_shares: u64,
    pub no_shares: u64,
    pub claimed: bool,
}

impl StorageData for PlayerMarketPosition {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerMarketPosition {
            yes_shares: *u64data.next().unwrap(),
            no_shares: *u64data.next().unwrap(),
            claimed: *u64data.next().unwrap() != 0,
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.yes_shares);
        data.push(self.no_shares);
        data.push(if self.claimed { 1 } else { 0 });
    }
}

pub struct PlayerMarketManager;

impl PlayerMarketManager {
    const POSITION_PREFIX: [u64; 2] = [2, 0]; // Prefix for player market position storage
    
    // 安全的 player_id 组合方法
    fn combine_player_id_safe(player_id: &[u64; 2]) -> u64 {
        // 使用更安全的组合方式，确保不会溢出
        // 取高32位和低32位，但限制在合理范围内
        let high = (player_id[0] & 0xFFFFFFFF) << 32;
        let low = player_id[1] & 0xFFFFFFFF;
        high | low
    }
    
    pub fn get_position(player_id: &[u64; 2], market_id: u64) -> PlayerMarketPosition {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::POSITION_PREFIX[0], Self::POSITION_PREFIX[1], combined_player_id, market_id];
        let mut data = kvpair.get(&key);
        if !data.is_empty() {
            let mut u64data = data.iter_mut();
            PlayerMarketPosition::from_data(&mut u64data)
        } else {
            PlayerMarketPosition::default()
        }
    }
    
    pub fn store_position(player_id: &[u64; 2], market_id: u64, position: &PlayerMarketPosition) {
        let mut data = vec![];
        position.to_data(&mut data);
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::POSITION_PREFIX[0], Self::POSITION_PREFIX[1], combined_player_id, market_id];
        kvpair.set(&key, data.as_slice());
    }
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerData {
    pub balance: u64,
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

    // Multi-market support methods using indexed storage
    pub fn get_yes_shares_for_market(&self, player_id: &[u64; 2], market_id: u64) -> u64 {
        let position = PlayerMarketManager::get_position(player_id, market_id);
        position.yes_shares
    }

    pub fn get_no_shares_for_market(&self, player_id: &[u64; 2], market_id: u64) -> u64 {
        let position = PlayerMarketManager::get_position(player_id, market_id);
        position.no_shares
    }

    pub fn add_yes_shares_for_market(&mut self, player_id: &[u64; 2], market_id: u64, shares: u64) {
        let mut position = PlayerMarketManager::get_position(player_id, market_id);
        position.yes_shares += shares;
        PlayerMarketManager::store_position(player_id, market_id, &position);
    }

    pub fn add_no_shares_for_market(&mut self, player_id: &[u64; 2], market_id: u64, shares: u64) {
        let mut position = PlayerMarketManager::get_position(player_id, market_id);
        position.no_shares += shares;
        PlayerMarketManager::store_position(player_id, market_id, &position);
    }

    pub fn subtract_yes_shares_for_market(&mut self, player_id: &[u64; 2], market_id: u64, shares: u64) -> Result<(), u32> {
        let mut position = PlayerMarketManager::get_position(player_id, market_id);
        if position.yes_shares < shares {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }
        position.yes_shares -= shares;
        PlayerMarketManager::store_position(player_id, market_id, &position);
        Ok(())
    }

    pub fn subtract_no_shares_for_market(&mut self, player_id: &[u64; 2], market_id: u64, shares: u64) -> Result<(), u32> {
        let mut position = PlayerMarketManager::get_position(player_id, market_id);
        if position.no_shares < shares {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }
        position.no_shares -= shares;
        PlayerMarketManager::store_position(player_id, market_id, &position);
        Ok(())
    }

    pub fn claim_winnings_for_market(&mut self, player_id: &[u64; 2], market_id: u64) -> Result<(), u32> {
        let mut position = PlayerMarketManager::get_position(player_id, market_id);
        if position.claimed {
            return Err(ERROR_ALREADY_CLAIMED);
        }
        position.claimed = true;
        PlayerMarketManager::store_position(player_id, market_id, &position);
        Ok(())
    }
}

impl StorageData for PlayerData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerData {
            balance: *u64data.next().unwrap(),
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.balance);
    }
}

pub type Player = zkwasm_rest_abi::Player<PlayerData>; 