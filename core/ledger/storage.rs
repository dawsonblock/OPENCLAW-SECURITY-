use std::fs::{File, OpenOptions};
use std::io::{self, Write, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use blake3::Hasher;

const SEGMENT_SIZE: u64 = 64 * 1024 * 1024; // 64 MB per segment
const MERKLE_COMPACTION_INTERVAL: u64 = 1024; // Compact Merkle tree every 1024 entries

/// Represents a strictly append-only, log-structured deterministic storage engine.
pub struct DeterministicStore {
    base_dir: PathBuf,
    current_segment_id: u64,
    current_file: Option<File>,
    current_offset: u64,
    entry_count: u64,
}

impl DeterministicStore {
    pub fn new(base_dir: &Path) -> io::Result<Self> {
        std::fs::create_dir_all(base_dir)?;
        let mut store = Self {
            base_dir: base_dir.to_path_buf(),
            current_segment_id: 0,
            current_file: None,
            current_offset: 0,
            entry_count: 0,
        };
        store.open_segment(0)?;
        Ok(store)
    }

    fn segment_path(&self, id: u64) -> PathBuf {
        self.base_dir.join(format!("log_{:08x}.dat", id))
    }

    fn open_segment(&mut self, id: u64) -> io::Result<()> {
        let path = self.segment_path(id);
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        let metadata = file.metadata()?;
        self.current_segment_id = id;
        self.current_file = Some(file);
        self.current_offset = metadata.len();
        Ok(())
    }

    fn roll_segment(&mut self) -> io::Result<()> {
        if let Some(file) = &mut self.current_file {
            file.sync_all()?;
        }
        self.open_segment(self.current_segment_id + 1)?;
        Ok(())
    }

    /// Appends a new Ledger entry deterministically.
    /// The input must already contain the hash of the payload linked to the previous entry log.
    pub fn append_entry(&mut self, payload: &[u8]) -> io::Result<()> {
        let payload_len = payload.len() as u64;
        let entry_size = 8 + payload_len; // 8 bytes for length prefix

        if self.current_offset + entry_size > SEGMENT_SIZE {
            self.roll_segment()?;
        }

        let mut file = self.current_file.as_ref().unwrap();
        // Deterministic write sequence: length prefix followed by payload.
        let mut wfile = file.try_clone()?;
        wfile.write_all(&(payload_len as u32).to_le_bytes())?;
        wfile.write_all(payload)?;
        
        self.current_offset += entry_size;
        self.entry_count += 1;

        // Note: fsync is deferred until an explicit flush/commit point 
        // to batch I/O, maintaining the determinism of write ordering.

        if self.entry_count % MERKLE_COMPACTION_INTERVAL == 0 {
            self.compact_merkle_checkpoint()?;
        }
        Ok(())
    }

    /// Ensures the deterministic ordering is physically realized on disk.
    pub fn commit(&mut self) -> io::Result<()> {
        if let Some(file) = &mut self.current_file {
            file.sync_data()?;
        }
        Ok(())
    }

    fn compact_merkle_checkpoint(&self) -> io::Result<()> {
        // In a real implementation:
        // 1. Traverse the last 1024 entry hashes.
        // 2. Compute a deterministic Merkle root.
        // 3. Write securely to index/merkle.chk using a rename-replace pattern to ensure atomicity.
        let chk_path = self.base_dir.join("merkle.chk.tmp");
        let mut f = File::create(&chk_path)?;
        f.write_all(b"MERKLE_ROOT_PLACEHOLDER")?;
        f.sync_all()?;
        std::fs::rename(chk_path, self.base_dir.join("merkle.chk"))?;
        Ok(())
    }
}
