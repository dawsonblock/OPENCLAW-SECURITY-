use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrecommitMsg {
    pub node_id: u64,
    pub local_hash: String,
    pub ledger_head: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OrderMsg {
    pub order_id: u64,
    pub target_hash: String,
}

/// Represents the deterministic central Sequencer in the distributed RFSN cluster.
/// In a production system, this would be a full Raft leader. For this skeleton, 
/// it's a fixed-order atomic counter that assigns a strictly monotonic `order_id` 
/// to incoming `PrecommitMsg` requests.
pub struct Sequencer {
    order_id_counter: AtomicU64,
    last_known_head: Arc<Mutex<String>>,
}

impl Sequencer {
    pub fn new() -> Self {
        Self {
            order_id_counter: AtomicU64::new(1),
            last_known_head: Arc::new(Mutex::new(String::new())),
        }
    }

    /// Handles a precommit request from a Node.
    /// If the Node's ledger head matches the cluster's contiguous view, it is assigned 
    /// the next global order ID. Otherwise, it is rejected (triggering a freeze/sync).
    pub async fn handle_precommit(&self, req: PrecommitMsg) -> Result<OrderMsg, String> {
        let mut head = self.last_known_head.lock().await;

        // Divergence Check:
        // By freezing on divergence, the Sequencer forces nodes to replay/resync 
        // until they have absolute bit-identical states before ordering new work.
        if !head.is_empty() && *head != req.ledger_head {
            return Err(format!(
                "CLUSTER DIVERGENCE DETECTED. Sequencer head: {} | Node head: {}",
                *head, req.ledger_head
            ));
        }

        let assigned_id = self.order_id_counter.fetch_add(1, Ordering::SeqCst);
        
        // Optimistically update sequencer head. (Real Raft forces an append-entries heartbeat)
        *head = req.local_hash.clone();

        Ok(OrderMsg {
            order_id: assigned_id,
            target_hash: req.local_hash,
        })
    }
}
