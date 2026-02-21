use std::error::Error;
use std::fs;
use std::path::Path;
use reqwest::blocking::Client; // Requires `reqwest` for external HTTP calls
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct NotarizeRequest {
    pub ledger_head_hash: String,
    pub index: u64,
    pub timestamp_ticks: u64,
}

#[derive(Deserialize)]
struct NotarizeResponse {
    pub receipt_id: String,
    pub external_timestamp: u64,
    pub signature: String, // Witness signature of the payload
}

/// External anchoring (notarization) serves as a tamper-evident seal.
/// It periodically takes the `merkle.chk` or `ledger.head` and publishes 
/// it to an external, untrusted but immutable witness (e.g., a timestamping authority, 
/// a distributed ledger, or a transparency log).
pub struct NotaryClient {
    endpoint_url: String,
    client: Client,
}

impl NotaryClient {
    pub fn new(url: &str) -> Self {
        Self {
            endpoint_url: url.to_string(),
            client: Client::new(),
        }
    }

    /// Read the latest Merkle checkpoint or Ledger head from disk and notarize it.
    pub fn notarize_checkpoint(&self, checkpoint_path: &Path, current_index: u64, ticks: u64) -> Result<(), Box<dyn Error>> {
        // In a real system, you parse the Merkle root from the checkpoint file.
        // For simplicity, we read the raw hex representation here.
        let raw_hash = fs::read_to_string(checkpoint_path)?;
        let trimmed_hash = raw_hash.trim().to_string();

        let req = NotarizeRequest {
            ledger_head_hash: trimmed_hash.clone(),
            index: current_index,
            timestamp_ticks: ticks,
        };

        // Publish the hash signature to the external witness
        let res = self.client.post(&self.endpoint_url)
            .json(&req)
            .send()?;

        if !res.status().is_success() {
            return Err(format!("Notarization failed with HTTP {}", res.status()).into());
        }

        let receipt: NotarizeResponse = res.json()?;
        
        // Save the receipt locally. The combination of local state + external receipt
        // proves this ledger head existed at `external_timestamp` and hasn't been rewritten.
        let receipt_path = checkpoint_path.with_extension(format!("{}.receipt", receipt.receipt_id));
        let receipt_data = serde_json::to_string_pretty(&receipt)?;
        fs::write(receipt_path, receipt_data)?;

        println!("✅ Anchored Ledger Index {} (Hash: {}) to Witness Authority.", current_index, trimmed_hash);
        Ok(())
    }
}
