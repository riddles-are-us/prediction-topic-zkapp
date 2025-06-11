use crate::error::*;
use crate::event::{insert_event, EVENT_MARKET_UPDATE, EVENT_BET_UPDATE, EVENT_PLAYER_UPDATE};
use crate::player::Player;
use crate::state::{GLOBAL_STATE};
use crate::event::MarketEvent;
use zkwasm_rest_abi::StorageData;

#[derive(Clone)]
pub enum Command {
    // Standard activities
    Activity(Activity),
    // Standard withdraw and deposit
    Withdraw(Withdraw),
    Deposit(Deposit),
    // Standard player install and timer
    InstallPlayer,
    Tick,
}

pub trait CommandHandler {
    fn handle(&self, pid: &[u64; 2], nonce: u64, rand: &[u64; 4], counter: u64) -> Result<(), u32>;
}

#[derive(Clone)]
pub struct Withdraw {
    pub data: [u64; 3],
}

impl CommandHandler for Withdraw {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], _counter: u64) -> Result<(), u32> {
        let mut player = Player::get_from_pid(pid);
        match player.as_mut() {
            None => Err(ERROR_PLAYER_NOT_EXIST),
            Some(player) => {
                player.check_and_inc_nonce(nonce);
                let balance = player.data.balance;
                let amount = self.data[0] & 0xffffffff;
                unsafe { zkwasm_rust_sdk::require(balance >= amount) };
                player.data.balance -= amount;
                let withdrawinfo = zkwasm_rest_abi::WithdrawInfo::new(&[self.data[0], self.data[1], self.data[2]], 0);
                crate::settlement::SettlementInfo::append_settlement(withdrawinfo);
                player.store();
                Ok(())
            }
        }
    }
}

#[derive(Clone)]
pub struct Deposit {
    pub data: [u64; 3],
}

impl CommandHandler for Deposit {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], _counter: u64) -> Result<(), u32> {
        let mut admin = Player::get_from_pid(pid).unwrap();
        admin.check_and_inc_nonce(nonce);
        let mut player = Player::get_from_pid(&[self.data[0], self.data[1]]);
        match player.as_mut() {
            None => Err(ERROR_PLAYER_NOT_EXIST),
            Some(player) => {
                player.data.balance += self.data[2];
                player.store();
                admin.store();
                Ok(())
            }
        }
    }
}

#[derive(Clone)]
pub enum Activity {
    // Prediction market activities
    Bet(u64, u64),  // bet_type, amount
    Sell(u64, u64), // sell_type, shares_amount
    Resolve(u64),   // outcome
    Claim,          // claim winnings
    WithdrawFees,   // withdraw collected fees (admin only)
}

impl CommandHandler for Activity {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], counter: u64) -> Result<(), u32> {
        let mut player = Player::get_from_pid(pid);
        match player.as_mut() {
            None => Err(ERROR_PLAYER_NOT_EXIST),
            Some(player) => {
                player.check_and_inc_nonce(nonce);
                match self {
                    Activity::Bet(bet_type, amount) => {
                        Self::handle_bet(player, *bet_type, *amount, counter)
                    },
                    Activity::Sell(sell_type, shares) => {
                        Self::handle_sell(player, *sell_type, *shares, counter)
                    },
                    Activity::Resolve(outcome) => {
                        // Only admin can resolve - we need to check this at a higher level
                        Self::handle_resolve(*outcome, counter)
                    },
                    Activity::Claim => {
                        Self::handle_claim(player, counter)
                    },
                    Activity::WithdrawFees => {
                        // Only admin can withdraw fees - we need to check this at a higher level
                        Self::handle_withdraw_fees(player, counter)
                    }
                }
            }
        }
    }
}

impl Activity {
    fn handle_bet(player: &mut Player, bet_type: u64, amount: u64, _counter: u64) -> Result<(), u32> {
        if amount == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        // Check if market is active
        let current_time = GLOBAL_STATE.0.borrow_mut().ensure_active()?;

        // Check player balance
        player.data.spend_balance(amount)?;

        // Place bet
        let shares = if bet_type == 1 {
            // YES bet
            let shares = GLOBAL_STATE.0.borrow_mut().market.bet_yes(amount)?;
            player.data.add_yes_shares(shares);
            shares
        } else {
            // NO bet
            let shares = GLOBAL_STATE.0.borrow_mut().market.bet_no(amount)?;
            player.data.add_no_shares(shares);
            shares
        };

        // Store updated data
        player.store();

        // Emit events
        // Self::emit_player_event(&player);
        Self::emit_market_event();
        Self::emit_bet_event(player.player_id, bet_type, amount, shares, current_time);

        Ok(())
    }

    fn handle_sell(player: &mut Player, sell_type: u64, shares: u64, _counter: u64) -> Result<(), u32> {
        if shares == 0 {
            return Err(ERROR_INVALID_BET_AMOUNT);
        }

        // Check if market is active
        let current_time = GLOBAL_STATE.0.borrow_mut().ensure_active()?;

        // Check player has enough shares and sell
        let payout = if sell_type == 1 {
            // Sell YES shares
            if player.data.yes_shares < shares {
                return Err(ERROR_INSUFFICIENT_BALANCE);
            }
            let payout = GLOBAL_STATE.0.borrow_mut().market.sell_yes(shares)?;
            player.data.yes_shares -= shares;
            payout
        } else {
            // Sell NO shares
            if player.data.no_shares < shares {
                return Err(ERROR_INSUFFICIENT_BALANCE);
            }
            let payout = GLOBAL_STATE.0.borrow_mut().market.sell_no(shares)?;
            player.data.no_shares -= shares;
            payout
        };

        // Add payout to player balance
        player.data.balance += payout;

        // Store updated data
        player.store();

        // Emit events
        // Self::emit_player_event(&player);
        Self::emit_market_event();
        Self::emit_sell_event(player.player_id, sell_type, shares, payout, current_time);

        Ok(())
    }

    fn handle_resolve(outcome: u64, _counter: u64) -> Result<(), u32> {
        let mut global_state = GLOBAL_STATE.0.borrow_mut();
        let current_time = global_state.counter;

        // TODO: Uncomment this when production is ready
        // if !global_state.market.can_resolve(current_time) {
        //     return Err(ERROR_MARKET_NOT_RESOLVED);
        // }

        let outcome_bool = outcome != 0;
        global_state.market.resolve(outcome_bool)?;

        // Release the borrow before emitting events
        drop(global_state);

        // Emit market update event
        Self::emit_market_event();

        Ok(())
    }

    fn handle_claim(player: &mut Player, _counter: u64) -> Result<(), u32> {
        let global_state = GLOBAL_STATE.0.borrow();
        
        if !global_state.market.resolved {
            return Err(ERROR_MARKET_NOT_RESOLVED);
        }

        // Check if already claimed
        player.data.claim_winnings()?;

        // Calculate payout
        let payout = global_state.market.calculate_payout(
            player.data.yes_shares,
            player.data.no_shares,
        )?;

        if payout == 0 {
            return Err(ERROR_NO_WINNING_POSITION);
        }

        // Add payout to balance
        player.data.add_balance(payout);
        player.store();

        drop(global_state);

        // Emit player update event
        // Self::emit_player_event(&player);

        Ok(())
    }

    fn handle_withdraw_fees(player: &mut Player, _counter: u64) -> Result<(), u32> {
        let mut global_state = GLOBAL_STATE.0.borrow_mut();
        
        let fees_collected = global_state.market.total_fees_collected;
        
        if fees_collected == 0 {
            return Err(ERROR_NO_WINNING_POSITION); // Reuse this error for "no fees to withdraw"
        }

        // Transfer fees to admin's balance
        player.data.add_balance(fees_collected);
        
        // Reset collected fees to zero
        global_state.market.total_fees_collected = 0;

        // Release the borrow before emitting events
        drop(global_state);

        // Store updated player data
        player.store();

        // Emit events
        // Self::emit_player_event(&player);
        Self::emit_market_event();

        Ok(())
    }

    fn emit_player_event(player: &Player) {
        let mut data = vec![
            player.player_id[0],
            player.player_id[1],
            player.data.balance,
            player.data.yes_shares,
            player.data.no_shares,
            if player.data.claimed { 1 } else { 0 },
        ];
        insert_event(EVENT_PLAYER_UPDATE, &mut data);
    }

    fn emit_market_event() {
        let global_state = GLOBAL_STATE.0.borrow();
        let market_event = MarketEvent::from(&global_state.market);
        let mut data = Vec::with_capacity(3);
        data.push(global_state.counter);
        market_event.to_data(&mut data);
        insert_event(EVENT_MARKET_UPDATE, &mut data);
    }

    fn emit_bet_event(player_id: [u64; 2], bet_type: u64, amount: u64, shares: u64, counter: u64) {
        let mut data = vec![
            player_id[0],
            player_id[1],
            counter,
            bet_type,
            amount,
            shares,
        ];
        insert_event(EVENT_BET_UPDATE, &mut data);
    }

    fn emit_sell_event(player_id: [u64; 2], sell_type: u64, shares: u64, payout: u64, counter: u64) {
        let mut data = vec![
            player_id[0],
            player_id[1],
            counter,
            sell_type + 10, // 11 = SELL_YES, 12 = SELL_NO (distinguish from bet events)
            shares,
            payout,
        ];
        insert_event(EVENT_BET_UPDATE, &mut data); // Reuse BET_UPDATE event for now
    }
}

pub fn decode_error(e: u32) -> &'static str {
    match e {
        ERROR_INVALID_BET_AMOUNT => "InvalidBetAmount",
        ERROR_MARKET_NOT_ACTIVE => "MarketNotActive", 
        ERROR_MARKET_NOT_RESOLVED => "MarketNotResolved",
        ERROR_NO_WINNING_POSITION => "NoWinningPosition",
        ERROR_ALREADY_CLAIMED => "AlreadyClaimed",
        ERROR_UNAUTHORIZED => "Unauthorized",
        ERROR_INSUFFICIENT_BALANCE => "InsufficientBalance",
        ERROR_MARKET_ALREADY_RESOLVED => "MarketAlreadyResolved",
        ERROR_INVALID_MARKET_TIME => "InvalidMarketTime",
        ERROR_INVALID_BET_TYPE => "InvalidBetType",
        ERROR_PLAYER_NOT_EXIST => "PlayerNotExist",
        ERROR_PLAYER_ALREADY_EXISTS => "PlayerAlreadyExists",
        _ => "Unknown",
    }
} 
