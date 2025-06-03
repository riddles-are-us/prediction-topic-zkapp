use serde::Serialize;

lazy_static::lazy_static! {
    pub static ref ADMIN_PUBKEY: [u64; 4] = {
        let bytes = include_bytes!("./admin.pubkey");
        let u64s = unsafe { std::slice::from_raw_parts(bytes.as_ptr() as *const u64, 4) };
        u64s.try_into().unwrap()
    };
}

#[derive(Serialize, Clone)]
pub struct Config {
    actions: [&'static str; 3],
    name: [&'static str; 1],
}

lazy_static::lazy_static! {
    pub static ref CONFIG: Config = Config {
        actions: ["bet", "resolve", "claim"],
        name: ["prediction_market"],
    };
}

impl Config {
    pub fn to_json_string() -> String {
        serde_json::to_string(&CONFIG.clone()).unwrap()
    }

    // enable timer tick
    pub fn autotick() -> bool {
        true
    }
}

// Event types
pub const EVENT_MARKET_UPDATE: u64 = 1;
pub const EVENT_BET_UPDATE: u64 = 2;
pub const EVENT_PLAYER_UPDATE: u64 = 3;

// Market constants
pub const INITIAL_LIQUIDITY: u64 = 1000000; // Initial liquidity for AMM
pub const PLATFORM_FEE_RATE: u64 = 25; // 0.25% platform fee (25/10000) 