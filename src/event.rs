use zkwasm_rest_abi::StorageData;
use std::convert::From;
use crate::market::MarketData;

/// External Events that are handled by external handler
pub static mut EVENTS: Vec<u64> = vec![];

pub fn clear_events(a: Vec<u64>) -> Vec<u64> {
    let mut c = a;
    unsafe {
        c.append(&mut EVENTS);
    }
    return c;
}

pub fn insert_event(typ: u64, data: &mut Vec<u64>) {
    unsafe {
        EVENTS.push((typ << 32) + data.len() as u64);
        EVENTS.append(data);
    }
}

// Event type constants for prediction market
pub const EVENT_PLAYER_UPDATE: u64 = 1;
pub const EVENT_MARKET_UPDATE: u64 = 2;
pub const EVENT_BET_UPDATE: u64 = 3; 


pub struct MarketEvent {
    // Virtual liquidity for AMM pricing
    yes_liquidity: u64,
    no_liquidity: u64,
}

impl StorageData for MarketEvent {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        MarketEvent {
            yes_liquidity: *u64data.next().unwrap(),
            no_liquidity: *u64data.next().unwrap(),
        }
    }
    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.yes_liquidity);
        data.push(self.no_liquidity);
    }
}

impl From<&MarketData> for MarketEvent {
    fn from(m: &MarketData) -> MarketEvent {
        MarketEvent {
            yes_liquidity: m.yes_liquidity,
            no_liquidity: m.no_liquidity,
        }
    }
}
