use serde::Serialize;
use zkwasm_rest_abi::{StorageData, MERKLE_MAP};
use std::cell::RefCell;
use crate::market::MarketData;
use crate::player::PlayerData;

#[derive(Serialize)]
pub struct QueryState {
    counter: u64,
    total_players: u64,
}

#[derive(Serialize, Clone)]
pub struct GlobalState {
    pub counter: u64,
    pub market: MarketData,
    pub total_players: u64,
    pub txsize: u64,
}

impl GlobalState {
    pub fn new() -> Self {
        // Default market: "Will Bitcoin reach $100,000 by end of 2024?"
        // Time is based on counter ticks (5 seconds per tick)
        // Start immediately (counter = 0)
        // End after 1 day = 86400 seconds = 17280 ticks
        // Resolution time same as end time
        let market = MarketData::new(
            "Bitcoin $100K by 2024".to_string(),
            "Will Bitcoin reach $100,000 USD by December 31, 2024?".to_string(),
            0,      // Start time (counter = 0, system start)
            17280,  // End time (counter = 17280, ~1 day later)
            17280,  // Resolution time (same as end time)
        );

        GlobalState {
            counter: 0,
            market,
            total_players: 0,
            txsize: 0,
        }
    }



    pub fn snapshot() -> String {
        let counter = GLOBAL_STATE.0.borrow().counter;
        let total_players = GLOBAL_STATE.0.borrow().total_players;
        serde_json::to_string(&QueryState { counter, total_players }).unwrap()
    }

    pub fn get_state(pid: Vec<u64>) -> String {
        let player_id = zkwasm_rest_abi::Player::<PlayerData>::pkey_to_pid(&pid.try_into().unwrap());
        let player = zkwasm_rest_abi::Player::<PlayerData>::get_from_pid(&player_id);
        
        match player {
            Some(player) => serde_json::to_string(&player).unwrap(),
            None => {
                let empty_player = PlayerData::default();
                serde_json::to_string(&empty_player).unwrap()
            }
        }
    }

    pub fn preempt() -> bool {
        let mut state = GLOBAL_STATE.0.borrow_mut();
        let counter = state.counter;
        let txsize = state.txsize;
        let withdraw_size = crate::settlement::SettlementInfo::settlement_size();
        if counter % 600 == 0 || txsize >= 40 || withdraw_size > 40 {
            state.txsize = 0;
            return true;
        } else {
            return false;
        }
    }

    pub fn flush_settlement() -> Vec<u8> {
        crate::settlement::SettlementInfo::flush_settlement()
    }

    pub fn rand_seed() -> u64 {
        0
    }

    pub fn store_into_kvpair(&self) {
        let mut v = vec![];
        v.push(self.counter);
        v.push(self.total_players);
        v.push(self.txsize);
        self.market.to_data(&mut v);
        let kvpair = unsafe { &mut MERKLE_MAP };
        kvpair.set(&[0, 0, 0, 0], v.as_slice());
    }

    pub fn fetch(&mut self) {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let mut data = kvpair.get(&[0, 0, 0, 0]);
        if !data.is_empty() {
            let mut u64data = data.iter_mut();
            let counter = *u64data.next().unwrap();
            let total_players = *u64data.next().unwrap();
            let txsize = *u64data.next().unwrap();
            self.counter = counter;
            self.total_players = total_players;
            self.txsize = txsize;
            self.market = MarketData::from_data(&mut u64data);
        }
    }

    pub fn store() {
        GLOBAL_STATE.0.borrow_mut().store_into_kvpair();
    }

    pub fn initialize() {
        GLOBAL_STATE.0.borrow_mut().fetch();
    }

    pub fn get_counter() -> u64 {
        GLOBAL_STATE.0.borrow().counter
    }
}

impl StorageData for GlobalState {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        GlobalState {
            counter: *u64data.next().unwrap(),
            total_players: *u64data.next().unwrap(),
            txsize: *u64data.next().unwrap(),
            market: MarketData::from_data(u64data),
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.counter);
        data.push(self.total_players);
        data.push(self.txsize);
        self.market.to_data(data);
    }
}

pub struct SafeState(pub RefCell<GlobalState>);
unsafe impl Sync for SafeState {}

lazy_static::lazy_static! {
    pub static ref GLOBAL_STATE: SafeState = SafeState(RefCell::new(GlobalState::new()));
}

// Transaction constants
const TICK: u64 = 0;
const INSTALL_PLAYER: u64 = 1;
const WITHDRAW: u64 = 2;
const DEPOSIT: u64 = 3;
const BET: u64 = 4;
const RESOLVE: u64 = 5;
const CLAIM: u64 = 6;

pub struct Transaction {
    command: crate::command::Command,
    nonce: u64,
}

impl Transaction {
    pub fn decode_error(e: u32) -> &'static str {
        crate::command::decode_error(e)
    }

    pub fn decode(params: &[u64]) -> Self {
        use crate::command::{Command, Activity, Withdraw, Deposit};
        use zkwasm_rest_abi::enforce;
        
        let command = params[0] & 0xff;
        let nonce = params[0] >> 16;
        
        let command = if command == WITHDRAW {
            Command::Withdraw(Withdraw {
                data: [params[2], params[3], params[4]]
            })
        } else if command == DEPOSIT {
            enforce(params[3] == 0, "check deposit index"); // only token index 0 is supported
            Command::Deposit(Deposit {
                data: [params[1], params[2], params[4]]
            })
        } else if command == BET {
            Command::Activity(Activity::Bet(params[1], params[2]))
        } else if command == RESOLVE {
            Command::Activity(Activity::Resolve(params[1]))
        } else if command == CLAIM {
            Command::Activity(Activity::Claim)
        } else if command == INSTALL_PLAYER {
            Command::InstallPlayer
        } else {
            unsafe { zkwasm_rust_sdk::require(command == TICK) };
            Command::Tick
        };
        
        Transaction { command, nonce }
    }

    pub fn create_player(&self, pkey: &[u64; 4]) -> Result<(), u32> {
        use crate::player::Player;
        use crate::error::ERROR_PLAYER_NOT_EXIST;
        
        let player_id = Player::pkey_to_pid(pkey);
        let player = Player::get_from_pid(&player_id);
        match player {
            Some(_) => Err(ERROR_PLAYER_NOT_EXIST), // Player already exists
            None => {
                let player = Player::new_from_pid(player_id);
                player.store();
                Ok(())
            }
        }
    }

    pub fn tick(&self) {
        GLOBAL_STATE.0.borrow_mut().counter += 1;
    }

    pub fn inc_tx_number(&self) {
        GLOBAL_STATE.0.borrow_mut().txsize += 1;
    }

    pub fn process(&self, pkey: &[u64; 4], rand: &[u64; 4]) -> Vec<u64> {
        use crate::command::{Activity, CommandHandler};
        use crate::config::ADMIN_PUBKEY;
        use crate::event::clear_events;
        use crate::player::Player;
        use zkwasm_rust_sdk::require;
        
        let pid = Player::pkey_to_pid(pkey);
        let counter = GLOBAL_STATE.0.borrow().counter;
        
        let e = match &self.command {
            crate::command::Command::Tick => {
                unsafe { require(*pkey == *ADMIN_PUBKEY) };
                self.tick();
                0
            },
            crate::command::Command::InstallPlayer => self.create_player(pkey)
                .map_or_else(|e| e, |_| 0),
            crate::command::Command::Withdraw(cmd) => cmd.handle(&pid, self.nonce, rand, counter)
                .map_or_else(|e| e, |_| 0),
            crate::command::Command::Activity(cmd) => {
                // Check admin permissions for resolve command
                if let Activity::Resolve(_) = cmd {
                    unsafe { require(*pkey == *ADMIN_PUBKEY) };
                }
                cmd.handle(&pid, self.nonce, rand, counter)
                    .map_or_else(|e| e, |_| 0)
            },
            crate::command::Command::Deposit(cmd) => {
                unsafe { require(*pkey == *ADMIN_PUBKEY) };
                cmd.handle(&pid, self.nonce, rand, counter)
                    .map_or_else(|e| e, |_| 0)
            },
        };

        if e == 0 {
            match self.command {
                crate::command::Command::Tick => (),
                _ => {
                    self.inc_tx_number();
                }
            }
        }
        let txsize = GLOBAL_STATE.0.borrow().txsize;
        clear_events(vec![e as u64, txsize])
    }
}

 