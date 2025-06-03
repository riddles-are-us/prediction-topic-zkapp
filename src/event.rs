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